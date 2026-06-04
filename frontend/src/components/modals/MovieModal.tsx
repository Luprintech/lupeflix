import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModalShell } from './ModalShell';
import { FavoriteButtons } from './FavoriteButtons';
import { MetadataModal } from './MetadataModal';
import { Spinner } from '../ui/Spinner';
import { StarRating } from '../ui/StarRating';
import { Card } from '../ui/Card';
import { getMovie, getExtras } from '../../lib/services';
import { tmdbBackdrop } from '../../lib/tmdb';
import { formatDuration, formatFileSize, splitGenres } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { Movie, SimilarItem, Extras } from '../../types';

interface MovieModalProps {
  movieId: number | null;
  onClose: () => void;
  onPlay: (id: number, title: string) => void;
  onOpenMovie: (id: number) => void;
}

export function MovieModal({ movieId, onClose, onPlay, onOpenMovie }: MovieModalProps) {
  const { isAdmin } = useAuth();
  const [showTrailer, setShowTrailer] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const { data: movie, isLoading } = useQuery({
    queryKey: ['movie', movieId],
    queryFn: () => getMovie(movieId as number),
    enabled: movieId != null,
  });

  const { data: extras } = useQuery({
    queryKey: ['extras', movieId],
    queryFn: () => getExtras(movieId as number),
    enabled: movieId != null,
  });

  const open = movieId != null;

  return (
    <>
      <ModalShell open={open} onClose={onClose}>
        {isLoading || !movie ? (
          <div className="flex h-96 items-center justify-center">
            <Spinner className="h-10 w-10" />
          </div>
        ) : (
          <MovieModalBody
            movie={movie}
            extras={extras}
            showTrailer={showTrailer}
            isAdmin={isAdmin}
            onPlay={() => onPlay(movie.id, movie.title)}
            onToggleTrailer={() => setShowTrailer((s) => !s)}
            onIdentify={() => setShowMetadata(true)}
            onOpenSimilar={onOpenMovie}
          />
        )}
      </ModalShell>

      {open && movie && (
        <MetadataModal
          open={showMetadata}
          movieId={movie.id}
          initialQuery={movie.original_title || movie.title}
          initialType={movie.type === 'tv' ? 'tv' : 'movie'}
          onClose={() => setShowMetadata(false)}
        />
      )}
    </>
  );
}

interface BodyProps {
  movie: Movie;
  extras: Extras | undefined;
  showTrailer: boolean;
  isAdmin: boolean;
  onPlay: () => void;
  onToggleTrailer: () => void;
  onIdentify: () => void;
  onOpenSimilar: (id: number) => void;
}

function MovieModalBody({
  movie,
  extras,
  showTrailer,
  isAdmin,
  onPlay,
  onToggleTrailer,
  onIdentify,
  onOpenSimilar,
}: BodyProps) {
  const genres = splitGenres(movie.genres);
  const director = movie.director || extras?.director;
  const cast = movie.cast ? movie.cast.split(',').map((c) => c.trim()).filter(Boolean) : [];
  const libSimilar = (extras?.similar || []).filter((s) => s.in_library);

  return (
    <div>
      {/* Backdrop / trailer */}
      <div className="relative aspect-video w-full bg-black">
        {showTrailer && extras?.trailer ? (
          <iframe
            title="Tráiler"
            src={`https://www.youtube.com/embed/${extras.trailer}?autoplay=1&rel=0`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <>
            <img
              src={tmdbBackdrop(movie)}
              alt={movie.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-netflix-surface via-netflix-surface/20 to-transparent" />
            <div className="absolute bottom-4 left-4 right-12 sm:bottom-6 sm:left-8">
              <h2 className="text-shadow-hero text-2xl font-black text-white sm:text-4xl">
                {movie.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onPlay}
                  className="flex items-center gap-2 rounded bg-white px-6 py-2 font-bold text-black transition-colors hover:bg-white/80"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Reproducir
                </button>
                {extras?.trailer && (
                  <button
                    type="button"
                    onClick={onToggleTrailer}
                    className="rounded bg-white/20 px-5 py-2 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                  >
                    Tráiler
                  </button>
                )}
                <FavoriteButtons movieId={movie.id} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details */}
      <div className="space-y-4 p-4 sm:p-8">
        {showTrailer && (
          <button
            type="button"
            onClick={onToggleTrailer}
            className="text-sm font-medium text-netflix-muted hover:text-white"
          >
            ← Volver a la portada
          </button>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-netflix-muted">
          <StarRating rating={movie.rating} />
          {movie.year && <span>{movie.year}</span>}
          {movie.duration ? <span>{formatDuration(movie.duration)}</span> : null}
          {movie.file_size ? <span>{formatFileSize(movie.file_size)}</span> : null}
          <span className="rounded border border-netflix-border px-1.5 py-0.5 uppercase">
            {movie.type === 'documentary' ? 'Documental' : 'Película'}
          </span>
        </div>

        {movie.description && (
          <p className="text-sm leading-relaxed text-white/90 sm:text-base">{movie.description}</p>
        )}

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {genres.length > 0 && (
            <Detail label="Géneros" value={genres.join(', ')} />
          )}
          {director && <Detail label="Dirección" value={director} />}
          {cast.length > 0 && <Detail label="Reparto" value={cast.join(', ')} />}
        </dl>

        {isAdmin && (
          <button
            type="button"
            onClick={onIdentify}
            className="rounded border border-netflix-border px-4 py-2 text-sm font-medium text-netflix-muted transition-colors hover:border-white hover:text-white"
          >
            Identificar metadatos
          </button>
        )}

        {/* Similar titles in library */}
        {libSimilar.length > 0 && (
          <div className="pt-2">
            <h3 className="mb-3 text-lg font-bold text-white">Títulos similares</h3>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {libSimilar.map((s) => (
                <Card
                  key={s.tmdb_id}
                  movie={similarToMovie(s)}
                  onClick={() => s.library_id && onOpenSimilar(s.library_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-netflix-muted">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  );
}

function similarToMovie(s: SimilarItem): Movie {
  return {
    id: s.library_id ?? s.tmdb_id,
    title: s.title,
    poster_path: s.poster_path ?? undefined,
    year: s.year ?? undefined,
    rating: s.rating ?? undefined,
    type: s.media_type === 'tv' ? 'tv' : 'movie',
    tmdb_id: s.tmdb_id,
  };
}
