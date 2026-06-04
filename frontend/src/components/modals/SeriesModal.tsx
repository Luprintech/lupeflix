import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalShell } from './ModalShell';
import { FavoriteButtons } from './FavoriteButtons';
import { Spinner } from '../ui/Spinner';
import { StarRating } from '../ui/StarRating';
import { getSeriesDetail, refreshSeriesMetadata } from '../../lib/services';
import { tmdbBackdrop, tmdbStill } from '../../lib/tmdb';
import { formatDuration, splitGenres } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { Episode } from '../../types';

interface SeriesModalProps {
  seriesKey: string | null;
  onClose: () => void;
  onPlay: (id: number, title: string) => void;
}

export function SeriesModal({ seriesKey, onClose, onPlay }: SeriesModalProps) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [season, setSeason] = useState<string | null>(null);

  const { data: series, isLoading } = useQuery({
    queryKey: ['series', seriesKey],
    queryFn: () => getSeriesDetail(seriesKey as string),
    enabled: seriesKey != null,
  });

  const refresh = useMutation({
    mutationFn: () => refreshSeriesMetadata(seriesKey as string),
    onSuccess: () => {
      toast.success('Metadatos de la serie actualizados');
      void qc.invalidateQueries({ queryKey: ['series', seriesKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seasonNumbers = useMemo(
    () =>
      series
        ? Object.keys(series.seasons).sort((a, b) => Number(a) - Number(b))
        : [],
    [series]
  );

  const activeSeason = season ?? seasonNumbers[0] ?? null;
  const episodes = activeSeason ? series?.seasons[activeSeason] ?? [] : [];

  const open = seriesKey != null;

  return (
    <ModalShell open={open} onClose={onClose}>
      {isLoading || !series ? (
        <div className="flex h-96 items-center justify-center">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <div>
          <div className="relative aspect-video w-full bg-black">
            <img
              src={tmdbBackdrop(series)}
              alt={series.series_title}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-netflix-surface via-netflix-surface/20 to-transparent" />
            <div className="absolute bottom-4 left-4 right-12 sm:bottom-6 sm:left-8">
              <span className="mb-2 inline-block rounded bg-netflix-red px-2 py-0.5 text-xs font-bold uppercase text-white">
                Serie
              </span>
              <h2 className="text-shadow-hero text-2xl font-black text-white sm:text-4xl">
                {series.series_title}
              </h2>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-netflix-muted">
              <StarRating rating={series.rating} />
              {series.year && <span>{series.year}</span>}
              <span>
                {series.season_count} {series.season_count === 1 ? 'temporada' : 'temporadas'}
              </span>
              <span>{series.episode_count} episodios</span>
              <FavoriteButtons movieId={(series.seasons[seasonNumbers[0]]?.[0]?.id) ?? episodes[0]?.id ?? 0} />
            </div>

            {series.description && (
              <p className="text-sm leading-relaxed text-white/90 sm:text-base">
                {series.description}
              </p>
            )}

            {splitGenres(series.genres).length > 0 && (
              <p className="text-sm text-netflix-muted">
                <span className="text-white">Géneros: </span>
                {splitGenres(series.genres).join(', ')}
              </p>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="rounded border border-netflix-border px-4 py-2 text-sm font-medium text-netflix-muted transition-colors hover:border-white hover:text-white disabled:opacity-50"
              >
                {refresh.isPending ? 'Identificando…' : 'Identificar episodios'}
              </button>
            )}

            {/* Season selector */}
            {seasonNumbers.length > 1 && (
              <select
                value={activeSeason ?? ''}
                onChange={(e) => setSeason(e.target.value)}
                className="rounded border border-netflix-border bg-netflix-bg px-3 py-2 text-sm font-semibold text-white focus:border-netflix-red focus:outline-none"
              >
                {seasonNumbers.map((s) => (
                  <option key={s} value={s}>
                    Temporada {s}
                  </option>
                ))}
              </select>
            )}

            {/* Episode list */}
            <ul className="divide-y divide-netflix-border">
              {episodes.map((ep) => (
                <EpisodeRow
                  key={ep.id}
                  ep={ep}
                  onPlay={() => onPlay(ep.id, ep.title)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function EpisodeRow({ ep, onPlay }: { ep: Episode; onPlay: () => void }) {
  const label = ep.episode_title || `Episodio ${ep.episode_number}`;
  return (
    <li className="flex gap-3 py-3">
      <button
        type="button"
        onClick={onPlay}
        className="relative aspect-video w-32 shrink-0 overflow-hidden rounded bg-netflix-surface2 sm:w-40"
        aria-label={`Reproducir ${label}`}
      >
        {ep.poster_path ? (
          <img
            src={tmdbStill(ep.poster_path)}
            alt={label}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-netflix-surface2" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
          <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold text-white">
            {ep.episode_number ? `${ep.episode_number}. ` : ''}
            {label}
          </p>
          {ep.duration ? (
            <span className="shrink-0 text-xs text-netflix-muted">
              {formatDuration(ep.duration)}
            </span>
          ) : null}
        </div>
        {ep.description && (
          <p className="mt-1 line-clamp-2 text-sm text-netflix-muted">{ep.description}</p>
        )}
      </div>
    </li>
  );
}
