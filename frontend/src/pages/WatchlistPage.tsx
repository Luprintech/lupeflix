import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { CatalogControls } from '../components/ui/CatalogControls';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { ExternalContentModal } from '../components/modals/ExternalContentModal';
import { useModal } from '../contexts/ModalContext';
import { useCatalogPreferences } from '../hooks/useCatalogPreferences';
import { getExternalWatchlist, getFavorites } from '../lib/services';
import type { Movie } from '../types';

export function WatchlistPage() {
  const { openCard } = useModal();
  const { view, size, setView, setSize } = useCatalogPreferences();
  const [external, setExternal] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv' } | null>(null);

  const local = useQuery({
    queryKey: ['favorites', 'watchlist'],
    queryFn: () => getFavorites('watchlist'),
  });
  const externalList = useQuery({
    queryKey: ['external-watchlist'],
    queryFn: getExternalWatchlist,
  });

  const externalMovies: Movie[] = (externalList.data ?? []).map((item) => ({
    id: item.tmdb_id,
    title: item.title,
    poster_path: item.poster_path ?? undefined,
    year: item.year ?? undefined,
    rating: item.rating ?? undefined,
    type: item.media_type,
    tmdb_id: item.tmdb_id,
  }));

  const isLoading = local.isLoading || externalList.isLoading;

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Ver después</h1>
      <div className="mb-6">
        <CatalogControls view={view} size={size} onViewChange={setView} onSizeChange={setSize} />
      </div>

      {isLoading ? (
        <PosterGridSkeleton count={12} />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-4 text-xl font-bold text-white">En tu servidor</h2>
            <MovieGrid
              items={local.data ?? []}
              onCardClick={openCard}
              view={view}
              size={size}
              emptyMessage="No tienes contenido local en Ver después."
            />
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">Contenido seguido externo</h2>
            <MovieGrid
              items={externalMovies}
              onCardClick={(m) => setExternal({ tmdbId: m.tmdb_id ?? m.id, mediaType: m.type === 'tv' ? 'tv' : 'movie' })}
              view={view}
              size={size}
              emptyMessage="No sigues contenido externo todavía."
            />
          </section>
        </div>
      )}

      <ExternalContentModal selection={external} onClose={() => setExternal(null)} />
    </div>
  );
}
