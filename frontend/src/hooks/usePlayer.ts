import { useState, useCallback } from 'react';
import { buildStreamUrl } from '../lib/services';

export interface PlayerState {
  movieId: number | null;
  title: string;
  src: string | null;
}

const CLOSED: PlayerState = { movieId: null, title: '', src: null };

export function usePlayer() {
  const [state, setState] = useState<PlayerState>(CLOSED);

  const open = useCallback((id: number, title: string) => {
    setState({ movieId: id, title, src: buildStreamUrl(id) });
  }, []);

  const close = useCallback(() => {
    setState(CLOSED);
  }, []);

  return { state, open, close, isOpen: state.movieId != null };
}
