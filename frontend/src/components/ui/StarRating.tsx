import { formatRating } from '../../lib/utils';

interface StarRatingProps {
  rating?: number | null;
  className?: string;
}

/** Compact TMDB-style rating chip (e.g. ★ 8.4). */
export function StarRating({ rating, className = '' }: StarRatingProps) {
  const value = formatRating(rating);
  if (!value) return null;
  const numeric = Number(value);
  const color =
    numeric >= 7.5 ? 'text-green-400' : numeric >= 6 ? 'text-yellow-400' : 'text-orange-400';
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${color} ${className}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
      {value}
    </span>
  );
}
