import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import { getFavorites } from '../lib/services';

export function WatchlistPage() {
  const { openCard } = useModal();
  const { data, isLoading } = useQuery({
    queryKey: ['favorites', 'watchlist'],
    queryFn: () => getFavorites('watchlist'),
  });

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Ver después</h1>
      {isLoading ? (
        <PosterGridSkeleton count={12} />
      ) : (
        <MovieGrid
          items={data ?? []}
          onCardClick={openCard}
          emptyMessage="Tu lista de Ver después está vacía."
        />
      )}
    </div>
  );
}
