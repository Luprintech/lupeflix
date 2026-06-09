import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalShell } from './ModalShell';
import { FavoriteButtons } from './FavoriteButtons';
import { Spinner } from '../ui/Spinner';
import { StarRating } from '../ui/StarRating';
import { getSeriesDetail, refreshSeriesMetadata, setSeriesTmdb, tmdbSearch } from '../../lib/services';
import { tmdbBackdrop, tmdbImg, tmdbStill } from '../../lib/tmdb';
import { formatDuration, splitGenres } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { Episode, TmdbSearchResult } from '../../types';

interface SeriesModalProps {
  seriesKey: string | null;
  onClose: () => void;
  onPlay: (id: number, title: string) => void;
}

export function SeriesModal({ seriesKey, onClose, onPlay }: SeriesModalProps) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [season, setSeason] = useState<string | null>(null);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbSearchResult[]>([]);

  const { data: series, isLoading } = useQuery({
    queryKey: ['series', seriesKey],
    queryFn: () => getSeriesDetail(seriesKey as string),
    enabled: seriesKey != null,
  });

  const refresh = useMutation({
    mutationFn: () => refreshSeriesMetadata(seriesKey as string),
    onSuccess: (data) => {
      // Populate the cache directly with the fresh data returned by the endpoint
      // so episodes titles and posters update immediately without a second round-trip.
      if (data?.series) {
        qc.setQueryData(['series', seriesKey], data.series);
        if (data.series.series_key && data.series.series_key !== seriesKey) {
          qc.setQueryData(['series', data.series.series_key], data.series);
        }
      }
      void qc.invalidateQueries({ queryKey: ['series'] });
      toast.success('Metadatos de la serie actualizados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const identify = useMutation({
    mutationFn: (tmdbId: number) => setSeriesTmdb(seriesKey as string, tmdbId),
    onSuccess: (data) => {
      // Use the response data directly — the series_title (and therefore
      // series_key) may have changed to the TMDB canonical name. Populate
      // BOTH the old and new keys so the modal stays in sync instantly.
      if (data?.series) {
        qc.setQueryData(['series', seriesKey], data.series);
        if (data.series.series_key && data.series.series_key !== seriesKey) {
          qc.setQueryData(['series', data.series.series_key], data.series);
        }
      }
      setIdentifyOpen(false);
      setResults([]);
      void qc.invalidateQueries({ queryKey: ['series'] });
      toast.success('Portada y metadatos de serie actualizados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const searchTmdb = async () => {
    const q = (query || series?.series_title || '').trim();
    if (!q) return;
    try {
      const data = await tmdbSearch(q, 'tv');
      setResults(data.results ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo buscar en TMDB');
    }
  };

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
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => refresh.mutate()}
                    disabled={refresh.isPending}
                    className="rounded border border-netflix-border px-4 py-2 text-sm font-medium text-netflix-muted transition-colors hover:border-white hover:text-white disabled:opacity-50"
                  >
                    {refresh.isPending ? 'Identificando?' : 'Identificar episodios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifyOpen((v) => !v);
                      setQuery(series.series_title);
                    }}
                    className="rounded bg-netflix-red px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-netflix-red2"
                  >
                    Identificar portada de serie
                  </button>
                </div>

                {identifyOpen && (
                  <div className="rounded-lg border border-netflix-border bg-netflix-bg p-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void searchTmdb();
                        }}
                        placeholder="Buscar serie en TMDB..."
                        className="flex-1 rounded border border-netflix-border bg-netflix-surface px-3 py-2 text-sm text-white focus:border-netflix-red focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void searchTmdb()}
                        className="rounded bg-netflix-red px-4 py-2 text-sm font-bold text-white"
                      >
                        Buscar
                      </button>
                    </div>

                    {results.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {results.slice(0, 8).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => identify.mutate(item.id)}
                            disabled={identify.isPending}
                            className="rounded border border-netflix-border bg-netflix-surface p-2 text-left transition-colors hover:border-white disabled:opacity-60"
                          >
                            <img
                              src={tmdbImg(item.poster_path, 'w185') || `https://placehold.co/185x278/16162a/777?text=${encodeURIComponent(item.name || item.title || '?')}`}
                              alt={item.name || item.title || ''}
                              className="mb-2 aspect-[2/3] w-full rounded object-cover"
                            />
                            <p className="line-clamp-2 text-xs font-semibold text-white">{item.name || item.title}</p>
                            <p className="text-[11px] text-netflix-muted">{(item.first_air_date || item.release_date || '').slice(0, 4)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
