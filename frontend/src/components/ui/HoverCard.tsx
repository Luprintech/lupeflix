import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from './Card';
import { tmdbBackdrop, tmdbPoster } from '../../lib/tmdb';
import { getToken } from '../../lib/api';
import { isSeriesCard, formatRating, splitGenres } from '../../lib/utils';
import { useFavoriteState, useToggleFavorite } from '../../hooks/useFavorites';
import { useModal } from '../../contexts/ModalContext';
import type { Movie } from '../../types';

const EXPAND_DELAY_MS  = 600;
const COLLAPSE_DELAY_MS = 200;

interface HoverCardProps {
  movie: Movie;
  progress?: number;
  isSeries?: boolean;
  showRating?: boolean;
  onClick: () => void;
}

export function HoverCard({
  movie,
  progress,
  isSeries,
  showRating,
  onClick,
}: HoverCardProps) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandTimer  = useRef<ReturnType<typeof setTimeout>>();
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>();

  const [rect, setRect]       = useState<DOMRect | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted]     = useState(true);
  // Start fetching fav state as soon as the user shows hover intent
  const [hoverIntent, setHoverIntent] = useState(false);

  const { openCard, playMovie } = useModal();
  const series    = isSeries ?? isSeriesCard(movie);
  const token     = getToken();
  // Only stream individual movies/episodes with a real DB id and a file
  const canStream = !series && !!movie.file_path && !!token && movie.id > 0;
  const streamUrl = canStream
    ? `/stream/${movie.id}?token=${encodeURIComponent(token!)}`
    : null;

  const { data: favState }    = useFavoriteState(hoverIntent && movie.id > 0 ? movie.id : null);
  const toggleWatchlist       = useToggleFavorite(movie.id > 0 ? movie.id : null);
  const inWatchlist = favState?.in_watchlist ?? false;

  // ── timers ──────────────────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    clearTimeout(expandTimer.current);
    clearTimeout(collapseTimer.current);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const doExpand = useCallback(() => {
    if (!cardRef.current) return;
    setRect(cardRef.current.getBoundingClientRect());
    setExpanded(true);
  }, []);

  const doCollapse = useCallback(() => {
    setExpanded(false);
    setMuted(true);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    setHoverIntent(true);
    clearTimers();
    expandTimer.current = setTimeout(doExpand, EXPAND_DELAY_MS);
  }, [clearTimers, doExpand]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(expandTimer.current);
    collapseTimer.current = setTimeout(doCollapse, COLLAPSE_DELAY_MS);
  }, [doCollapse]);

  const keepOpen = useCallback(() => {
    clearTimeout(collapseTimer.current);
  }, []);

  // ── video lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !expanded || !streamUrl) return;
    vid.muted = muted;
    void vid.play().catch(() => {/* autoplay may be blocked */});
  }, [expanded, streamUrl, muted]);

  // ── actions ──────────────────────────────────────────────────────────────────
  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    doCollapse();
    if (!series && movie.id > 0 && movie.file_path) {
      // Movie with a real file → start playback immediately
      playMovie(movie.id, movie.title);
    } else {
      // Series or movie without file → open info/series modal
      openCard(movie);
    }
  }, [doCollapse, series, movie, playMovie, openCard]);

  const handleToggleWatchlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatchlist.mutate({ listType: 'watchlist', active: inWatchlist });
  }, [toggleWatchlist, inWatchlist]);

  const handleInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    doCollapse();
    openCard(movie);
  }, [doCollapse, openCard, movie]);

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted(v => {
      const next = !v;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Card
        movie={movie}
        isSeries={series}
        showRating={showRating}
        progress={progress}
        onClick={onClick}
      />

      <AnimatePresence>
        {expanded && rect && createPortal(
          <HoverPreview
            key={`hover-${movie.id}-${movie.series_key ?? ''}`}
            movie={movie}
            rect={rect}
            muted={muted}
            progress={progress}
            streamUrl={streamUrl}
            videoRef={videoRef}
            inWatchlist={inWatchlist}
            onMouseEnter={keepOpen}
            onMouseLeave={onMouseLeave}
            onToggleMute={handleToggleMute}
            onPlay={handlePlay}
            onToggleWatchlist={handleToggleWatchlist}
            onInfo={handleInfo}
          />,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}

// ── HoverPreview ─────────────────────────────────────────────────────────────

interface PreviewProps {
  movie: Movie;
  rect: DOMRect;
  muted: boolean;
  progress?: number;
  streamUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  inWatchlist: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onPlay: (e: React.MouseEvent) => void;
  onToggleWatchlist: (e: React.MouseEvent) => void;
  onInfo: (e: React.MouseEvent) => void;
}

function HoverPreview({
  movie, rect, muted, progress, streamUrl, videoRef,
  inWatchlist, onMouseEnter, onMouseLeave,
  onToggleMute, onPlay, onToggleWatchlist, onInfo,
}: PreviewProps) {
  const W = Math.max(Math.round(rect.width * 1.7), 320);
  const videoH = Math.round(W * 9 / 16);
  const totalH = videoH + 104; // video + actions section

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  // Center horizontally on card, clamp to viewport
  const left = Math.max(8, Math.min(
    rect.left + rect.width / 2 - W / 2,
    viewW - W - 8,
  ));
  // Center vertically on card, clamp to viewport
  const top = Math.max(8, Math.min(
    rect.top + rect.height / 2 - totalH / 2,
    viewH - totalH - 8,
  ));

  const backdropUrl = tmdbBackdrop(movie) || tmdbPoster(movie);
  const title       = movie.series_title || movie.title;
  const genres      = splitGenres(movie.genres).slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: 'fixed', left, top, width: W, zIndex: 9999 }}
      className="overflow-hidden rounded-xl bg-netflix-surface shadow-[0_28px_80px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
      // Prevent click on the preview backdrop from propagating
      onClick={e => e.stopPropagation()}
    >
      {/* ── Video / Backdrop ── */}
      <div className="relative" style={{ height: videoH }}>
        {streamUrl ? (
          <video
            ref={videoRef}
            src={streamUrl}
            muted={muted}
            playsInline
            loop
            preload="auto"
            className="h-full w-full object-cover"
          />
        ) : (
          <motion.img
            src={backdropUrl}
            alt={title}
            loading="eager"
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 6, ease: 'linear' }}
            className="h-full w-full object-cover"
          />
        )}

        {/* Bottom gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-netflix-surface to-transparent" />

        {/* Mute / Unmute button — only if there's a real video */}
        {streamUrl && (
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/60 bg-black/60 text-white transition-all hover:border-white hover:bg-black/80"
          >
            {muted ? <IconMute /> : <IconUnmute />}
          </button>
        )}
      </div>

      {/* ── Info & Actions ── */}
      <div className="px-3 pb-3 pt-2">
        {/* Progress bar */}
        {progress != null && progress > 0 && (
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-netflix-red"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play */}
            <button
              type="button"
              onClick={onPlay}
              aria-label="Reproducir"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-110 active:scale-95"
            >
              <IconPlay />
            </button>
            {/* Watchlist */}
            <button
              type="button"
              onClick={onToggleWatchlist}
              aria-label={inWatchlist ? 'Quitar de Ver después' : 'Añadir a Ver después'}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-white transition-all hover:scale-110 active:scale-95 ${
                inWatchlist
                  ? 'border-netflix-red bg-netflix-red/30'
                  : 'border-white/60 bg-black/60 hover:border-white'
              }`}
            >
              {inWatchlist ? <IconCheck /> : <IconPlus />}
            </button>
          </div>

          {/* Info (arrow down) */}
          <button
            type="button"
            onClick={onInfo}
            aria-label="Más información"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-black/60 text-white transition-all hover:scale-110 hover:border-white active:scale-95"
          >
            <IconChevronDown />
          </button>
        </div>

        {/* Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="font-semibold text-white line-clamp-1">{title}</span>
          {movie.year && <span className="text-netflix-muted">{movie.year}</span>}
          {movie.rating ? (
            <span className="font-semibold text-green-400">
              {formatRating(movie.rating)} ★
            </span>
          ) : null}
          {genres.length > 0 && (
            <span className="text-netflix-muted">{genres.join(' · ')}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-px fill-current">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconMute() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M11 5L6 9H2v6h4l5 4V5z" />
      <path strokeLinecap="round" d="M23 9l-6 6M17 9l6 6" />
    </svg>
  );
}

function IconUnmute() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M11 5L6 9H2v6h4l5 4V5z" />
      <path strokeLinecap="round" d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
