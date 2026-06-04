import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Movie } from '../types';
import { getSeriesKey, isSeriesCard } from '../lib/utils';
import { usePlayer } from '../hooks/usePlayer';
import { MovieModal } from '../components/modals/MovieModal';
import { SeriesModal } from '../components/modals/SeriesModal';
import { PlayerModal } from '../components/modals/PlayerModal';

interface ModalContextValue {
  openMovie: (id: number) => void;
  openSeries: (key: string, fallbackTitle?: string) => void;
  /** Smart entry point: routes a card to the right modal. */
  openCard: (movie: Movie) => void;
  playMovie: (id: number, title: string) => void;
  close: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [movieId, setMovieId] = useState<number | null>(null);
  const [seriesKey, setSeriesKey] = useState<string | null>(null);
  const player = usePlayer();

  const openMovie = useCallback((id: number) => {
    setSeriesKey(null);
    setMovieId(id);
  }, []);

  const openSeries = useCallback((key: string) => {
    setMovieId(null);
    setSeriesKey(key);
  }, []);

  const openCard = useCallback(
    (movie: Movie) => {
      if (isSeriesCard(movie)) {
        setMovieId(null);
        setSeriesKey(getSeriesKey(movie));
      } else {
        setSeriesKey(null);
        setMovieId(movie.id);
      }
    },
    []
  );

  const playMovie = useCallback(
    (id: number, title: string) => {
      player.open(id, title);
    },
    [player]
  );

  const close = useCallback(() => {
    setMovieId(null);
    setSeriesKey(null);
  }, []);

  const value: ModalContextValue = { openMovie, openSeries, openCard, playMovie, close };

  return (
    <ModalContext.Provider value={value}>
      {children}
      <MovieModal
        movieId={movieId}
        onClose={() => setMovieId(null)}
        onPlay={playMovie}
        onOpenMovie={openMovie}
      />
      <SeriesModal
        seriesKey={seriesKey}
        onClose={() => setSeriesKey(null)}
        onPlay={playMovie}
      />
      <PlayerModal state={player.state} onClose={player.close} />
    </ModalContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
