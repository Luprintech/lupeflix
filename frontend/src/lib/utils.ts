import type { Movie } from '../types';

/** Format minutes into "1h 24m" or "45m". */
export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** TMDB ratings are 0-10; show one decimal. */
export function formatRating(rating?: number | null): string {
  if (rating == null || rating <= 0) return '';
  return rating.toFixed(1);
}

/** Format bytes into a human-readable size. */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Escape HTML for the rare case we set text from untrusted data. */
export function escHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a stable series key matching the backend's seriesKeyFor logic.
 * Used to open the series modal and call /api/series/:key/seasons.
 */
export function getSeriesKey(m: Movie): string {
  if (m.series_key) return m.series_key;
  if (m.series_id != null) return `id:${m.series_id}`;
  if (m.series_title) return `title:${m.series_title.trim().toLowerCase()}`;
  return m.title || '';
}

/** A movie row is a series card when it's TV and grouped (is_series or episode_count). */
export function isSeriesCard(m: Movie): boolean {
  return m.type === 'tv' || m.is_series === 1 || (m.episode_count ?? 0) > 0;
}

/** Split a comma-separated genres string into trimmed chunks. */
export function splitGenres(genres?: string | null): string[] {
  if (!genres) return [];
  return genres
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

/** Truncate text with an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}
