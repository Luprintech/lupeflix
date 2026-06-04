import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max width class; defaults to a wide detail modal. */
  maxWidth?: string;
}

export function ModalShell({ open, onClose, children, maxWidth = 'max-w-4xl' }: ModalShellProps) {
  // Lock body scroll + close on Escape while open.
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
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-0 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className={`relative my-0 w-full ${maxWidth} overflow-hidden bg-netflix-surface shadow-card sm:my-4 sm:rounded-lg`}
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
