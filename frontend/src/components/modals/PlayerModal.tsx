import { AnimatePresence } from 'framer-motion';
import { VideoPlayer } from '../player/VideoPlayer';
import type { PlayerState } from '../../hooks/usePlayer';

interface PlayerModalProps {
  state: PlayerState;
  onClose: () => void;
}

export function PlayerModal({ state, onClose }: PlayerModalProps) {
  const open = state.movieId != null && state.src != null;

  return (
    <AnimatePresence>
      {open && (
        <VideoPlayer
          movieId={state.movieId!}
          title={state.title}
          src={state.src!}
          initialTime={state.initialTime}
          isSeries={state.isSeries}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
