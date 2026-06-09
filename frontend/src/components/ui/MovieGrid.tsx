import { motion } from 'framer-motion';
import type { Movie } from '../../types';
import { Card } from './Card';
import { HoverCard } from './HoverCard';
import type { CatalogView, PosterSize } from './CatalogControls';

interface MovieGridProps {
  items: Movie[];
  onCardClick: (m: Movie) => void;
  isSeries?: boolean;
  showRating?: boolean;
  emptyMessage?: string;
  view?: CatalogView;
  size?: PosterSize;
}

const GRID_CLASSES: Record<PosterSize, string> = {
  small: 'grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10',
  medium: 'grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7',
  large: 'grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
};

export function MovieGrid({
  items,
  onCardClick,
  isSeries,
  showRating,
  emptyMessage = 'No hay nada por aquí todavía.',
  view = 'grid',
  size = 'medium',
}: MovieGridProps) {
  if (!items.length) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-netflix-muted">
        {emptyMessage}
      </div>
    );
  }

  const listMode = view === 'list';
  const gridClass = view === 'compact'
    ? GRID_CLASSES.small
    : GRID_CLASSES[size];

  return (
    <div className={listMode ? 'space-y-2' : `grid ${gridClass}`}>
      {items.map((m, i) => (
        <motion.div
          key={`${m.id}-${m.series_key ?? ''}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
        >
          {/* List view and compact grid don't benefit from hover preview */}
          {listMode || view === 'compact' ? (
            <Card
              movie={m}
              isSeries={isSeries}
              showRating={showRating}
              variant={listMode ? 'list' : 'poster'}
              compact={view === 'compact'}
              onClick={() => onCardClick(m)}
            />
          ) : (
            <HoverCard
              movie={m}
              isSeries={isSeries}
              showRating={showRating}
              onClick={() => onCardClick(m)}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
