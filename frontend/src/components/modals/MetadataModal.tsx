import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ModalShell } from './ModalShell';
import { tmdbSearch, identifyMovie } from '../../lib/services';
import { tmdbImg } from '../../lib/tmdb';
import { Spinner } from '../ui/Spinner';
import type { TmdbSearchResult } from '../../types';

interface MetadataModalProps {
  open: boolean;
  movieId: number;
  initialQuery?: string;
  initialType?: 'movie' | 'tv';
  onClose: () => void;
  onApplied?: () => void;
}

export function MetadataModal({
  open,
  movieId,
  initialQuery = '',
  initialType = 'movie',
  onClose,
  onApplied,
}: MetadataModalProps) {
  const qc = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<'movie' | 'tv'>(initialType);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);

  const search = useMutation({
    mutationFn: () => tmdbSearch(query.trim(), type),
    onSuccess: (data) => {
      setResults(data.results || []);
      if (!data.results?.length) toast('Sin resultados en TMDB');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (r: TmdbSearchResult) => identifyMovie(movieId, r.id, type, type),
    onSuccess: (res) => {
      toast.success(`Identificado: ${res.title}`);
      void qc.invalidateQueries();
      onApplied?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <h2 className="mb-4 text-xl font-bold text-white">Identificar metadatos</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) search.mutate();
          }}
          className="mb-4 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título a buscar en TMDB"
            className="flex-1 rounded border border-netflix-border bg-netflix-bg px-3 py-2 text-sm text-white placeholder:text-netflix-muted focus:border-netflix-red focus:outline-none"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'movie' | 'tv')}
            className="rounded border border-netflix-border bg-netflix-bg px-3 py-2 text-sm text-white focus:border-netflix-red focus:outline-none"
          >
            <option value="movie">Película</option>
            <option value="tv">Serie</option>
          </select>
          <button
            type="submit"
            disabled={search.isPending || !query.trim()}
            className="rounded bg-netflix-red px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-netflix-red2 disabled:opacity-50"
          >
            Buscar
          </button>
        </form>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {search.isPending && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {results.map((r) => {
            const year = (r.release_date || r.first_air_date || '').slice(0, 4);
            return (
              <button
                key={r.id}
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(r)}
                className="flex w-full items-center gap-3 rounded border border-netflix-border bg-netflix-bg p-2 text-left transition-colors hover:border-netflix-red disabled:opacity-50"
              >
                {r.poster_path ? (
                  <img
                    src={tmdbImg(r.poster_path, 'w92')}
                    alt={r.title || r.name}
                    className="h-20 w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-20 w-14 shrink-0 rounded bg-netflix-surface2" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{r.title || r.name}</p>
                  <p className="text-sm text-netflix-muted">
                    {year || 's/f'} · TMDB #{r.id}
                    {r.vote_average ? ` · ★ ${r.vote_average.toFixed(1)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-netflix-red px-3 py-1.5 text-xs font-semibold text-white">
                  Aplicar
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
