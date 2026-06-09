import { useState, useCallback } from 'react';
import { buildStreamUrl } from '../lib/services';

export interface PlayerState {
  movieId:     number | null;
  title:       string;
  src:         string | null;
  initialTime: number;   // seconds — resume from here (0 = start from beginning)
  isSeries:    boolean;  // enables "next episode" button
}

const CLOSED: PlayerState = { movieId: null, title: '', src: null, initialTime: 0, isSeries: false };

export function usePlayer() {
  const [state, setState] = useState<PlayerState>(CLOSED);

  /** Open a movie/episode, optionally resuming from a saved position. */
  const open = useCallback((id: number, title: string, initialTime = 0, isSeries = false) => {
    setState({ movieId: id, title, src: buildStreamUrl(id), initialTime, isSeries });
  }, []);

  const close = useCallback(() => setState(CLOSED), []);

  return { state, open, close, isOpen: state.movieId != null };
}
