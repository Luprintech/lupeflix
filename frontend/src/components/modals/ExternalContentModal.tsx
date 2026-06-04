import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalShell } from './ModalShell';
import { Spinner } from '../ui/Spinner';
import { StarRating } from '../ui/StarRating';
import { addExternalWatchlist, getTmdbDetail, removeExternalWatchlist } from '../../lib/services';
import { tmdbImg } from '../../lib/tmdb';
import { formatDuration } from '../../lib/utils';
import { providerWatchUrl } from '../../lib/streamingLinks';
import type { Provider, ProviderSummary } from '../../types';

export interface ExternalSelection {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

interface ExternalContentModalProps {
  selection: ExternalSelection | null;
  onClose: () => void;
}

export function ExternalContentModal({ selection, onClose }: ExternalContentModalProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tmdb-detail', selection?.mediaType, selection?.tmdbId],
    queryFn: () => getTmdbDetail(selection?.mediaType ?? 'movie', selection?.tmdbId as number),
    enabled: selection != null,
  });

  const title = data?.title || data?.name || 'Contenido';
  const year = (data?.release_date || data?.first_air_date || '').slice(0, 4);
  const duration = data?.runtime || data?.episode_run_time?.[0];

  const addToExternal = useMutation({
    mutationFn: () => addExternalWatchlist({
      tmdb_id: data?.id ?? selection?.tmdbId ?? 0,
      media_type: selection?.mediaType ?? 'movie',
      title,
      year: Number(year) || null,
      poster_path: data?.poster_path ?? null,
      rating: data?.vote_average ?? null,
      providers: data?.providers ?? null,
    }),
    onSuccess: () => {
      toast.success('Añadido a contenido seguido');
      void qc.invalidateQueries({ queryKey: ['external-watchlist'] });
    },
    onError: () => toast.error('No se pudo añadir'),
  });

  const removeExternal = useMutation({
    mutationFn: () => removeExternalWatchlist(selection?.mediaType ?? 'movie', data?.id ?? selection?.tmdbId ?? 0),
    onSuccess: () => {
      toast.success('Eliminado de contenido seguido');
      void qc.invalidateQueries({ queryKey: ['external-watchlist'] });
    },
    onError: () => toast.error('No se pudo eliminar'),
  });

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
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => addToExternal.mutate()}
                disabled={addToExternal.isPending}
                className="rounded bg-netflix-red px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-netflix-red2 disabled:opacity-60"
              >
                Seguir contenido
              </button>
              <button
                type="button"
                onClick={() => removeExternal.mutate()}
                disabled={removeExternal.isPending}
                className="rounded border border-netflix-border px-4 py-2 text-sm font-medium text-netflix-muted transition-colors hover:border-white hover:text-white disabled:opacity-60"
              >
                Quitar de seguidos
              </button>
            </div>
            {data.overview && <p className="text-sm leading-relaxed text-white/90 sm:text-base">{data.overview}</p>}
            {data.genres?.length ? <Detail label="Géneros" value={data.genres.map((g) => g.name).join(', ')} /> : null}
            <ProvidersSection providers={data.providers} title={title} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

export function ProvidersSection({ providers, title }: { providers: ProviderSummary; title: string }) {
  const groups: Array<[string, Provider[]]> = useMemo(() => [
    ['Incluido en', providers.flatrate],
    ['Alquiler', providers.rent],
    ['Compra', providers.buy],
  ], [providers]);
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
                <ProviderLink key={`${label}-${provider.id}`} provider={provider} title={title} fallback={providers.link} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderLink({ provider, title, fallback }: { provider: Provider; title: string; fallback: string | null }) {
  const href = providerWatchUrl(provider.name, title, fallback);
  const content = (
    <>
      {provider.logo_path && <img src={tmdbImg(provider.logo_path, 'w45')} alt="" className="h-6 w-6 rounded" />}
      <span>{provider.name}</span>
    </>
  );
  const className = "inline-flex items-center gap-2 rounded-full border border-netflix-border bg-netflix-surface2 px-3 py-1.5 text-sm text-white transition-colors hover:border-white";

  if (!href) return <span className={className}>{content}</span>;
  return <a className={className} href={href} target="_blank" rel="noreferrer">{content}</a>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-netflix-muted">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  );
}
