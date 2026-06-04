import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Movie } from '../../types';
import { tmdbBackdrop } from '../../lib/tmdb';
import { isSeriesCard, splitGenres, truncate } from '../../lib/utils';
import { StarRating } from '../ui/StarRating';

interface HeroProps {
  items: Movie[];
  onPlay: (m: Movie) => void;
  onInfo: (m: Movie) => void;
}

const ROTATE_MS = 6000;

export function Hero({ items, onPlay, onInfo }: HeroProps) {
  const [index, setIndex] = useState(0);
  const slides = items.slice(0, 5);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;
  const current = slides[index];
  const series = isSeriesCard(current);
  const genres = splitGenres(current.genres).slice(0, 3);

  return (
    <div className="relative h-[62vh] min-h-[420px] w-full overflow-hidden sm:h-[78vh]">
      <AnimatePresence mode="sync">
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          <img
            src={tmdbBackdrop(current)}
            alt={current.title}
            className="h-full w-full object-cover object-top"
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-netflix-bg via-netflix-bg/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-netflix-bg/90 via-netflix-bg/40 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 z-10 w-full max-w-2xl px-4 pb-16 sm:px-12 sm:pb-24">
        <motion.div
          key={`text-${current.id}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <span className="mb-2 inline-block rounded bg-netflix-red px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            {series ? 'Serie' : current.type === 'documentary' ? 'Documental' : 'Película'}
          </span>
          <h1 className="text-shadow-hero mb-3 text-3xl font-black leading-tight text-white sm:text-5xl md:text-6xl">
            {current.series_title || current.title}
          </h1>

          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-white/80">
            <StarRating rating={current.rating} />
            {current.year && <span>{current.year}</span>}
            {genres.length > 0 && <span className="text-netflix-muted">{genres.join(' · ')}</span>}
          </div>

          {current.description && (
            <p className="text-shadow-hero mb-6 hidden max-w-xl text-sm text-white/90 sm:block sm:text-base">
              {truncate(current.description, 220)}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onPlay(current)}
              className="flex items-center gap-2 rounded bg-white px-6 py-2.5 font-bold text-black transition-colors hover:bg-white/80"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
              Reproducir
            </button>
            <button
              type="button"
              onClick={() => onInfo(current)}
              className="flex items-center gap-2 rounded bg-white/20 px-6 py-2.5 font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z" />
              </svg>
              Más información
            </button>
          </div>
        </motion.div>
      </div>

      {/* Dot navigation */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 right-4 z-10 flex gap-2 sm:right-12">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Ir al destacado ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
