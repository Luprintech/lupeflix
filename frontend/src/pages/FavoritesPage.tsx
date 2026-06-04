import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import { getFavorites } from '../lib/services';

export function FavoritesPage() {
  const { openCard } = useModal();
  const { data, isLoading } = useQuery({
    queryKey: ['favorites', 'favorite'],
    queryFn: () => getFavorites('favorite'),
  });

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Mis favoritos</h1>
      {isLoading ? (
        <PosterGridSkeleton count={12} />
      ) : (
        <MovieGrid
          items={data ?? []}
          onCardClick={openCard}
          emptyMessage="Todavía no tienes favoritos. Marca tus títulos con el corazón."
        />
      )}
    </div>
  );
}
