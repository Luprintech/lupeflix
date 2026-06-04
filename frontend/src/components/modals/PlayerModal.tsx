import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { saveProgress } from '../../lib/services';
import type { PlayerState } from '../../hooks/usePlayer';

interface PlayerModalProps {
  state: PlayerState;
  onClose: () => void;
}

const SAVE_INTERVAL_MS = 10_000;

export function PlayerModal({ state, onClose }: PlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const open = state.movieId != null;

  // Persist progress every 10s and once more on unmount/close.
  useEffect(() => {
    if (!open || state.movieId == null) return;
    const movieId = state.movieId;

    const persist = () => {
      const v = videoRef.current;
      if (!v || !v.duration || Number.isNaN(v.duration)) return;
      void saveProgress(movieId, Math.floor(v.currentTime), Math.floor(v.duration)).catch(
        () => undefined
      );
    };

    const id = window.setInterval(persist, SAVE_INTERVAL_MS);
    return () => {
      persist();
      window.clearInterval(id);
    };
  }, [open, state.movieId]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && state.src && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <h3 className="truncate text-sm font-semibold text-white sm:text-base">{state.title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar reproductor"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center px-0 sm:px-4 sm:pb-4">
            <video
              ref={videoRef}
              src={state.src}
              controls
              autoPlay
              playsInline
              className="h-full max-h-full w-full bg-black"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
