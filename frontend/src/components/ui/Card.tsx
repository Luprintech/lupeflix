import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Movie } from '../../types';
import { tmdbPoster } from '../../lib/tmdb';
import { isSeriesCard, formatRating } from '../../lib/utils';
import { StarRating } from './StarRating';

interface CardProps {
  movie: Movie;
  onClick: () => void;
  /** Force the SERIE badge regardless of detection (e.g. on series pages). */
  isSeries?: boolean;
  /** Show a rating badge in the corner (top-rated rows). */
  showRating?: boolean;
  /** Optional progress bar 0..1 for "continue watching". */
  progress?: number;
}

export function Card({ movie, onClick, isSeries, showRating, progress }: CardProps) {
  const [loaded, setLoaded] = useState(false);
  const series = isSeries ?? isSeriesCard(movie);
  const title = movie.series_title || movie.title;
  const poster = tmdbPoster(movie);
  const rating = formatRating(movie.rating);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.06, zIndex: 20 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="group relative block w-full overflow-hidden rounded-md bg-netflix-surface text-left shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
      aria-label={title}
    >
      <div className="relative aspect-[2/3] w-full">
        {!loaded && <div className="skeleton absolute inset-0" />}
        <img
          src={poster}
          alt={title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Type badge */}
        <span
          className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            series ? 'bg-netflix-red text-white' : 'bg-black/70 text-white'
          }`}
        >
          {series ? 'Serie' : movie.type === 'documentary' ? 'Doc' : 'Film'}
        </span>

        {/* Rating badge (top-rated rows) */}
        {showRating && rating && (
          <span className="absolute right-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-yellow-400">
            ★ {rating}
          </span>
        )}

        {/* Episode count for series */}
        {series && (movie.episode_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {movie.episode_count} ep
          </span>
        )}

        {/* Gradient + title overlay on hover */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="line-clamp-2 text-xs font-semibold text-white sm:text-sm">{title}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-netflix-muted">
            {movie.year && <span>{movie.year}</span>}
            <StarRating rating={movie.rating} />
          </div>
        </div>

        {/* Progress bar */}
        {progress != null && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div
              className="h-full bg-netflix-red"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    </motion.button>
  );
}
