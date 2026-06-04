import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Movie } from '../../types';
import { tmdbPoster } from '../../lib/tmdb';
import { isSeriesCard, formatRating, splitGenres } from '../../lib/utils';
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
  variant?: 'poster' | 'list';
  compact?: boolean;
}

export function Card({ movie, onClick, isSeries, showRating, progress, variant = 'poster', compact = false }: CardProps) {
  const [loaded, setLoaded] = useState(false);
  const series = isSeries ?? isSeriesCard(movie);
  const title = movie.series_title || movie.title;
  const poster = tmdbPoster(movie);
  const rating = formatRating(movie.rating);

  if (variant === 'list') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.99 }}
        className="group flex w-full gap-3 rounded-lg border border-netflix-border bg-netflix-surface p-2 text-left transition-colors hover:border-white/30 hover:bg-netflix-surface2 focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
        aria-label={title}
      >
        <img src={poster} alt={title} loading="lazy" className="h-24 w-16 shrink-0 rounded object-cover" />
        <div className="min-w-0 flex-1 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-white">{title}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${series ? 'bg-netflix-red text-white' : 'bg-black/70 text-white'}`}>
              {series ? 'Serie' : movie.type === 'documentary' ? 'Doc' : 'Film'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-netflix-muted">
            {movie.year && <span>{movie.year}</span>}
            <StarRating rating={movie.rating} />
            {series && (movie.episode_count ?? 0) > 0 && <span>{movie.episode_count} episodios</span>}
          </div>
          {movie.genres && <p className="mt-1 line-clamp-1 text-xs text-netflix-muted">{splitGenres(movie.genres).join(', ')}</p>}
          {movie.description && <p className="mt-2 line-clamp-2 text-sm text-white/80">{movie.description}</p>}
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: compact ? 1.04 : 1.06, zIndex: 20 }}
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
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />

        <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${series ? 'bg-netflix-red text-white' : 'bg-black/70 text-white'}`}>
          {series ? 'Serie' : movie.type === 'documentary' ? 'Doc' : 'Film'}
        </span>

        {showRating && rating && (
          <span className="absolute right-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-yellow-400">
            ★ {rating}
          </span>
        )}

        {series && (movie.episode_count ?? 0) > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {movie.episode_count} ep
          </span>
        )}

        <div className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-2 transition-opacity duration-200 ${compact ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
          <p className="line-clamp-2 text-xs font-semibold text-white sm:text-sm">{title}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-netflix-muted">
            {movie.year && <span>{movie.year}</span>}
            <StarRating rating={movie.rating} />
          </div>
        </div>

        {progress != null && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-netflix-red" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
          </div>
        )}
      </div>
    </motion.button>
  );
}
