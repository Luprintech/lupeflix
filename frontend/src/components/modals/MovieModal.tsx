import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModalShell } from './ModalShell';
import { FavoriteButtons } from './FavoriteButtons';
import { MetadataModal } from './MetadataModal';
import { Spinner } from '../ui/Spinner';
import { StarRating } from '../ui/StarRating';
import { Card } from '../ui/Card';
import { getMovie, getExtras, getPerson, getTmdbDetail } from '../../lib/services';
import { tmdbBackdrop, tmdbImg } from '../../lib/tmdb';
import { formatDuration, splitGenres } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { CastMember, Extras, Movie, Provider, ProviderSummary, SimilarItem } from '../../types';

interface MovieModalProps {
  movieId: number | null;
  onClose: () => void;
  onPlay: (id: number, title: string) => void;
  onOpenMovie: (id: number) => void;
}

interface ExternalSelection {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

export function MovieModal({ movieId, onClose, onPlay, onOpenMovie }: MovieModalProps) {
  const { isAdmin } = useAuth();
  const [showTrailer, setShowTrailer] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [personId, setPersonId] = useState<number | null>(null);
  const [external, setExternal] = useState<ExternalSelection | null>(null);

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

  const closeAll = () => {
    setPersonId(null);
    setExternal(null);
    setShowTrailer(false);
    onClose();
  };

  return (
    <>
      <ModalShell open={open} onClose={closeAll}>
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
            onOpenPerson={setPersonId}
            onOpenLibrary={onOpenMovie}
            onOpenExternal={setExternal}
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

      <PersonModal
        personId={personId}
        onClose={() => setPersonId(null)}
        onOpenLibrary={onOpenMovie}
        onOpenExternal={setExternal}
      />

      <ExternalContentModal
        selection={external}
        onClose={() => setExternal(null)}
      />
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
  onOpenPerson: (id: number) => void;
  onOpenLibrary: (id: number) => void;
  onOpenExternal: (selection: ExternalSelection) => void;
}

function MovieModalBody({
  movie,
  extras,
  showTrailer,
  isAdmin,
  onPlay,
  onToggleTrailer,
  onIdentify,
  onOpenPerson,
  onOpenLibrary,
  onOpenExternal,
}: BodyProps) {
  const genres = splitGenres(movie.genres);
  const director = movie.director || extras?.director;
  const castMembers = extras?.cast ?? [];
  const fallbackCast = movie.cast ? movie.cast.split(',').map((c) => c.trim()).filter(Boolean) : [];
  const similar = extras?.similar ?? [];

  return (
    <div>
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
            <img src={tmdbBackdrop(movie)} alt={movie.title} className="h-full w-full object-cover" />
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

      <div className="space-y-6 p-4 sm:p-8">
        {showTrailer && (
          <button type="button" onClick={onToggleTrailer} className="text-sm font-medium text-netflix-muted hover:text-white">
            ← Volver a la portada
          </button>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-netflix-muted">
          <StarRating rating={movie.rating} />
          {movie.year && <span>{movie.year}</span>}
          {movie.duration ? <span>{formatDuration(movie.duration)}</span> : null}
          <span className="rounded border border-netflix-border px-1.5 py-0.5 uppercase">
            {movie.type === 'documentary' ? 'Documental' : movie.type === 'tv' ? 'Serie' : 'Película'}
          </span>
        </div>

        {movie.description && <p className="text-sm leading-relaxed text-white/90 sm:text-base">{movie.description}</p>}

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {genres.length > 0 && <Detail label="Géneros" value={genres.join(', ')} />}
          {director && <Detail label="Dirección" value={director} />}
          {!castMembers.length && fallbackCast.length > 0 && <Detail label="Reparto" value={fallbackCast.join(', ')} />}
        </dl>

        {castMembers.length > 0 && <CastSection cast={castMembers} onOpenPerson={onOpenPerson} />}

        {extras?.providers && <ProvidersSection providers={extras.providers} />}

        {isAdmin && (
          <button
            type="button"
            onClick={onIdentify}
            className="rounded border border-netflix-border px-4 py-2 text-sm font-medium text-netflix-muted transition-colors hover:border-white hover:text-white"
          >
            Identificar metadatos
          </button>
        )}

        {similar.length > 0 && (
          <SimilarSection
            items={similar}
            onOpenLibrary={onOpenLibrary}
            onOpenExternal={onOpenExternal}
          />
        )}
      </div>
    </div>
  );
}

function CastSection({ cast, onOpenPerson }: { cast: CastMember[]; onOpenPerson: (id: number) => void }) {
  return (
    <section>
      <h3 className="mb-3 text-lg font-bold text-white">Reparto</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cast.map((actor) => (
          <button
            key={actor.id}
            type="button"
            onClick={() => onOpenPerson(actor.id)}
            className="w-24 shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
          >
            <img
              src={tmdbImg(actor.profile_path, 'w185') || `https://placehold.co/185x278/16162a/777?text=${encodeURIComponent(actor.name)}`}
              alt={actor.name}
              className="h-32 w-24 rounded object-cover"
              loading="lazy"
            />
            <p className="mt-2 line-clamp-2 text-xs font-semibold text-white">{actor.name}</p>
            {actor.character && <p className="line-clamp-2 text-[11px] text-netflix-muted">{actor.character}</p>}
          </button>
        ))}
      </div>
    </section>
  );
}

function SimilarSection({
  items,
  onOpenLibrary,
  onOpenExternal,
}: {
  items: SimilarItem[];
  onOpenLibrary: (id: number) => void;
  onOpenExternal: (selection: ExternalSelection) => void;
}) {
  return (
    <section className="pt-2">
      <h3 className="mb-3 text-lg font-bold text-white">Títulos similares</h3>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {items.map((s) => (
          <div key={`${s.media_type}-${s.tmdb_id}`} className="relative">
            <Card
              movie={similarToMovie(s)}
              onClick={() => {
                if (s.in_library && s.library_id) onOpenLibrary(s.library_id);
                else onOpenExternal({ tmdbId: s.tmdb_id, mediaType: s.media_type === 'tv' ? 'tv' : 'movie' });
              }}
            />
            <span className={`absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${s.in_library ? 'bg-netflix-red text-white' : 'bg-black/75 text-netflix-muted'}`}>
              {s.in_library ? 'En servidor' : 'Streaming'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PersonModal({
  personId,
  onClose,
  onOpenLibrary,
  onOpenExternal,
}: {
  personId: number | null;
  onClose: () => void;
  onOpenLibrary: (id: number) => void;
  onOpenExternal: (selection: ExternalSelection) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['person', personId],
    queryFn: () => getPerson(personId as number),
    enabled: personId != null,
  });

  return (
    <ModalShell open={personId != null} onClose={onClose} maxWidth="max-w-4xl">
      {isLoading || !data ? (
        <div className="flex h-72 items-center justify-center"><Spinner className="h-9 w-9" /></div>
      ) : (
        <div className="space-y-6 p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row">
            <img
              src={tmdbImg(data.person.profile_path, 'w342') || `https://placehold.co/342x513/16162a/777?text=${encodeURIComponent(data.person.name)}`}
              alt={data.person.name}
              className="mx-auto h-72 w-48 shrink-0 rounded-lg object-cover sm:mx-0"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl font-black text-white">{data.person.name}</h2>
              <p className="mt-2 text-sm text-netflix-muted">
                {[data.person.known_for_department, data.person.birthday, data.person.place_of_birth].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-4 max-h-72 overflow-y-auto text-sm leading-relaxed text-white/90">
                {data.person.biography || 'No hay biografía disponible en TMDB para este idioma.'}
              </p>
            </div>
          </div>

          {data.credits.length > 0 && (
            <section>
              <h3 className="mb-3 text-lg font-bold text-white">También aparece en</h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {data.credits.map((credit) => (
                  <Card
                    key={`${credit.media_type}-${credit.tmdb_id}`}
                    movie={similarToMovie(credit)}
                    onClick={() => {
                      if (credit.in_library && credit.library_id) onOpenLibrary(credit.library_id);
                      else onOpenExternal({ tmdbId: credit.tmdb_id, mediaType: credit.media_type === 'tv' ? 'tv' : 'movie' });
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </ModalShell>
  );
}

function ExternalContentModal({ selection, onClose }: { selection: ExternalSelection | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tmdb-detail', selection?.mediaType, selection?.tmdbId],
    queryFn: () => getTmdbDetail(selection?.mediaType ?? 'movie', selection?.tmdbId as number),
    enabled: selection != null,
  });

  const title = data?.title || data?.name || 'Contenido';
  const year = (data?.release_date || data?.first_air_date || '').slice(0, 4);
  const duration = data?.runtime || data?.episode_run_time?.[0];

  return (
    <ModalShell open={selection != null} onClose={onClose} maxWidth="max-w-3xl">
      {isLoading || !data ? (
        <div className="flex h-72 items-center justify-center"><Spinner className="h-9 w-9" /></div>
      ) : (
        <div>
          <div className="relative aspect-video bg-black">
            <img
              src={tmdbImg(data.backdrop_path, 'original') || tmdbImg(data.poster_path, 'w780')}
              alt={title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-netflix-surface via-netflix-surface/40 to-transparent" />
            <div className="absolute bottom-5 left-5 right-12">
              <h2 className="text-3xl font-black text-white">{title}</h2>
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-netflix-muted">
              <StarRating rating={data.vote_average} />
              {year && <span>{year}</span>}
              {duration ? <span>{formatDuration(duration)}</span> : null}
              <span className="rounded border border-netflix-border px-1.5 py-0.5 uppercase">
                {selection?.mediaType === 'tv' ? 'Serie externa' : 'Película externa'}
              </span>
            </div>
            {data.overview && <p className="text-sm leading-relaxed text-white/90 sm:text-base">{data.overview}</p>}
            {data.genres?.length ? <Detail label="Géneros" value={data.genres.map((g) => g.name).join(', ')} /> : null}
            <ProvidersSection providers={data.providers} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function ProvidersSection({ providers }: { providers: ProviderSummary }) {
  const groups: Array<[string, Provider[]]> = [
    ['Incluido en', providers.flatrate],
    ['Alquiler', providers.rent],
    ['Compra', providers.buy],
  ];
  const hasProviders = groups.some(([, list]) => list.length > 0);

  if (!hasProviders) {
    return <p className="text-sm text-netflix-muted">No hay plataformas de streaming disponibles para España en TMDB.</p>;
  }

  return (
    <section>
      <h3 className="mb-3 text-lg font-bold text-white">Dónde verla</h3>
      <div className="space-y-3">
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-netflix-muted">{label}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((provider) => (
                <ProviderLink key={`${label}-${provider.id}`} provider={provider} href={providers.link} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderLink({ provider, href }: { provider: Provider; href: string | null }) {
  const content = (
    <>
      {provider.logo_path && <img src={tmdbImg(provider.logo_path, 'w45')} alt="" className="h-6 w-6 rounded" />}
      <span>{provider.name}</span>
    </>
  );

  const className = "inline-flex items-center gap-2 rounded-full border border-netflix-border bg-netflix-surface2 px-3 py-1.5 text-sm text-white transition-colors hover:border-white";

  if (!href) return <span className={className}>{content}</span>;

  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
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
