import { motion } from 'framer-motion';
import type { Movie } from '../../types';
import { Card } from './Card';

interface MovieGridProps {
  items: Movie[];
  onCardClick: (m: Movie) => void;
  isSeries?: boolean;
  showRating?: boolean;
  emptyMessage?: string;
}

export function MovieGrid({
  items,
  onCardClick,
  isSeries,
  showRating,
  emptyMessage = 'No hay nada por aquí todavía.',
}: MovieGridProps) {
  if (!items.length) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-netflix-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {items.map((m, i) => (
        <motion.div
          key={`${m.id}-${m.series_key ?? ''}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
        >
          <Card
            movie={m}
            isSeries={isSeries}
            showRating={showRating}
            onClick={() => onCardClick(m)}
          />
        </motion.div>
      ))}
    </div>
  );
}
