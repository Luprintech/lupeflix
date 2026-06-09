/**
 * Returns the best URL to watch a specific title on a provider.
 *
 * Priority:
 *  1. `justwatchLink` — the TMDB-provided JustWatch URL for this exact content.
 *     It goes to the specific content page on JustWatch, which has properly
 *     deep-linked "Watch on [Platform]" buttons. This is the only URL that
 *     reliably opens the content (not just a login screen).
 *  2. JustWatch title search — a cross-platform search, still better than
 *     opening a platform's own search/login page.
 *
 * Note: platform-specific search URLs (e.g. netflix.com/search?q=...) are
 * intentionally NOT used — they display the platform's login page for
 * unauthenticated users and don't link to the specific content even when logged in.
 */
export function providerWatchUrl(
  _providerName: string,
  title: string,
  justwatchLink?: string | null,
): string {
  if (justwatchLink) return justwatchLink;
  return `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(title)}`;
}
