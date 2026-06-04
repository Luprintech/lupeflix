import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { GenreChips } from '../components/ui/GenreChips';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import { useDebounce } from '../hooks/useDebounce';
import { getMovies } from '../lib/services';
import { splitGenres } from '../lib/utils';

export function MoviesPage() {
  const { openCard } = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [genre, setGenre] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(search, 350);

  // Keep the URL in sync with the search box.
  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      return next;
    }, { replace: true });
  }, [debouncedSearch, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['movies', 'catalog', debouncedSearch, genre],
    queryFn: () =>
      getMovies({
        type: 'movie',
        limit: 200,
        search: debouncedSearch || undefined,
        genre: genre || undefined,
      }),
  });

  const movies = data?.results ?? [];

  const genres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => splitGenres(m.genres).forEach((g) => set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [movies]);

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black text-white sm:text-3xl">Películas</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar películas..."
          className="w-full rounded border border-netflix-border bg-netflix-surface px-4 py-2 text-sm text-white placeholder:text-netflix-muted focus:border-netflix-red focus:outline-none sm:w-72"
        />
      </div>

      <div className="mb-6">
        <GenreChips genres={genres} active={genre} onSelect={setGenre} />
      </div>

      {isLoading ? (
        <PosterGridSkeleton count={18} />
      ) : (
        <MovieGrid
          items={movies}
          onCardClick={openCard}
          emptyMessage="No se encontraron películas."
        />
      )}
    </div>
  );
}
