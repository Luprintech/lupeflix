import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Hero } from '../components/hero/Hero';
import { ContentRow } from '../components/carousel/ContentRow';
import { GenreChips } from '../components/ui/GenreChips';
import { RowSkeleton } from '../components/ui/Skeleton';
import { useModal } from '../contexts/ModalContext';
import {
  getFeatured,
  getRecent,
  getRecommendations,
  getTop,
  getHistory,
  getBecauseWatched,
} from '../lib/services';
import { isSeriesCard, splitGenres } from '../lib/utils';
import type { Movie } from '../types';

export function HomePage() {
  const { openCard, playMovie } = useModal();
  const navigate = useNavigate();
  const [genre, setGenre] = useState<string | null>(null);

  const featured = useQuery({ queryKey: ['featured'], queryFn: getFeatured });
  const recent = useQuery({ queryKey: ['recent'], queryFn: getRecent });
  const recommendations = useQuery({
    queryKey: ['recommendations', 'all'],
    queryFn: () => getRecommendations(undefined, 24),
  });
  const top = useQuery({ queryKey: ['top', 'movie'], queryFn: () => getTop('movie', 15) });
  const history = useQuery({ queryKey: ['history'], queryFn: getHistory });
  const because = useQuery({
    queryKey: ['because-watched', 'all'],
    queryFn: () => getBecauseWatched(undefined, 20),
  });

  // Build genre list from everything we loaded.
  const genres = useMemo(() => {
    const pool = [
      ...(recent.data ?? []),
      ...(recommendations.data ?? []),
      ...(top.data ?? []),
    ];
    const set = new Set<string>();
    pool.forEach((m) => splitGenres(m.genres).forEach((g) => set.add(g)));
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 16);
  }, [recent.data, recommendations.data, top.data]);

  const byGenre = (items: Movie[] = []) =>
    genre ? items.filter((m) => splitGenres(m.genres).includes(genre)) : items;

  // Continue watching: incomplete history with measurable progress.
  const continueWatching = (history.data ?? []).filter(
    (h) => !h.completed && (h.progress ?? 0) > 0
  );
  const progressMap = Object.fromEntries(
    continueWatching.map((h) => [
      h.id,
      h.h_duration ? (h.progress ?? 0) / h.h_duration : 0,
    ])
  );

  const isLoading =
    featured.isLoading && recent.isLoading && recommendations.isLoading && top.isLoading;

  return (
    <div className="pb-12">
      {featured.data && featured.data.length > 0 && (
        <Hero
          items={byGenre(featured.data)}
          onPlay={(m) => (isSeriesCard(m) ? openCard(m) : playMovie(m.id, m.title))}
          onInfo={openCard}
        />
      )}

      <div className="relative z-10 -mt-10 space-y-2 px-4 sm:-mt-16 sm:px-12">
        <GenreChips genres={genres} active={genre} onSelect={setGenre} />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : (
          <>
            {continueWatching.length > 0 && (
              <ContentRow
                title="Continuar viendo"
                items={byGenre(continueWatching)}
                onCardClick={openCard}
                progressMap={progressMap}
              />
            )}

            <ContentRow
              title="Recomendadas para ti"
              items={byGenre(recommendations.data)}
              onCardClick={openCard}
            />

            <ContentRow
              title="Agregadas recientemente"
              items={byGenre(recent.data)}
              onCardClick={openCard}
              onSeeMore={() => navigate('/movies')}
            />

            <ContentRow
              title="Mejor valoradas"
              items={byGenre(top.data)}
              onCardClick={openCard}
              showRating
            />

            {because.data?.title && because.data.items.length > 0 && (
              <ContentRow
                title={`Porque viste ${because.data.title}`}
                items={byGenre(because.data.items)}
                onCardClick={openCard}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
