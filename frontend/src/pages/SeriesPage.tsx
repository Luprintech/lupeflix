import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { GenreChips } from '../components/ui/GenreChips';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import { useDebounce } from '../hooks/useDebounce';
import { getSeries } from '../lib/services';
import { splitGenres } from '../lib/utils';

export function SeriesPage() {
  const { openCard } = useModal();
  const [genre, setGenre] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const { data, isLoading } = useQuery({
    queryKey: ['series', 'catalog', debouncedSearch],
    queryFn: () => getSeries(300, debouncedSearch || undefined),
  });

  const all = data?.results ?? [];
  const series = genre
    ? all.filter((m) => splitGenres(m.genres).includes(genre))
    : all;

  const genres = useMemo(() => {
    const set = new Set<string>();
    all.forEach((m) => splitGenres(m.genres).forEach((g) => set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black text-white sm:text-3xl">Series</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar series..."
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
          items={series}
          onCardClick={openCard}
          isSeries
          emptyMessage="No se encontraron series."
        />
      )}
    </div>
  );
}
