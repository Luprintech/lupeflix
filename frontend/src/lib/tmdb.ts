export function tmdbImg(path?: string | null, size = 'w342'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function tmdbPoster(m: {
  poster_path?: string;
  title?: string;
  series_title?: string;
  series_poster?: string;
}): string {
  const p = m.series_poster || m.poster_path;
  const img = tmdbImg(p);
  if (img) return img;
  const label = m.series_title || m.title || '?';
  return `https://placehold.co/300x450/1f1f1f/444?text=${encodeURIComponent(label)}`;
}

export function tmdbBackdrop(m: { backdrop_path?: string; poster_path?: string }): string {
  return tmdbImg(m.backdrop_path, 'original') || tmdbImg(m.poster_path, 'w780');
}

export function tmdbStill(path?: string | null): string {
  return tmdbImg(path, 'w300');
}
