import { useQuery } from '@tanstack/react-query';
import { MovieGrid } from '../components/ui/MovieGrid';
import { CatalogControls } from '../components/ui/CatalogControls';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import { useCatalogPreferences } from '../hooks/useCatalogPreferences';
import { getFavorites } from '../lib/services';

export function FavoritesPage() {
  const { openCard } = useModal();
  const { view, size, setView, setSize } = useCatalogPreferences();
  const { data, isLoading } = useQuery({
    queryKey: ['favorites', 'favorite'],
    queryFn: () => getFavorites('favorite'),
  });

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <h1 className="mb-6 text-2xl font-black text-white sm:text-3xl">Mis favoritos</h1>
      <div className="mb-6">
        <CatalogControls view={view} size={size} onViewChange={setView} onSizeChange={setSize} />
      </div>
      {isLoading ? (
        <PosterGridSkeleton count={12} />
      ) : (
        <MovieGrid
          items={data ?? []}
          onCardClick={openCard}
          view={view}
          size={size}
          emptyMessage="Todav?a no tienes favoritos. Marca tus t?tulos con el coraz?n."
        />
      )}
    </div>
  );
}
