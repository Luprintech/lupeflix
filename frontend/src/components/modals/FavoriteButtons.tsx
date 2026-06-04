import { useFavoriteState, useToggleFavorite } from '../../hooks/useFavorites';

interface FavoriteButtonsProps {
  movieId: number;
}

export function FavoriteButtons({ movieId }: FavoriteButtonsProps) {
  const { data: state } = useFavoriteState(movieId);
  const toggle = useToggleFavorite(movieId);

  const isFav = state?.is_favorite ?? false;
  const inList = state?.in_watchlist ?? false;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate({ listType: 'favorite', active: isFav })}
        aria-pressed={isFav}
        aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
          isFav
            ? 'border-netflix-red bg-netflix-red text-white'
            : 'border-white/40 text-white hover:border-white'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </button>
      <button
        type="button"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate({ listType: 'watchlist', active: inList })}
        aria-pressed={inList}
        aria-label={inList ? 'Quitar de Ver después' : 'Añadir a Ver después'}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
          inList
            ? 'border-white bg-white text-black'
            : 'border-white/40 text-white hover:border-white'
        }`}
      >
        {inList ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        )}
      </button>
    </div>
  );
}
