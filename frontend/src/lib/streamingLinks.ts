export function providerWatchUrl(providerName: string, title: string, fallback?: string | null): string | null {
  const q = encodeURIComponent(title);
  const normalized = providerName.toLowerCase();

  if (normalized.includes('netflix')) return `https://www.netflix.com/search?q=${q}`;
  if (normalized.includes('prime') || normalized.includes('amazon')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`;
  if (normalized.includes('disney')) return `https://www.disneyplus.com/search?q=${q}`;
  if (normalized.includes('hbo') || normalized.includes('max')) return `https://play.max.com/search?q=${q}`;
  if (normalized.includes('apple')) return `https://tv.apple.com/search?term=${q}`;
  if (normalized.includes('filmin')) return `https://www.filmin.es/buscar?search=${q}`;
  if (normalized.includes('movistar')) return `https://ver.movistarplus.es/buscar?term=${q}`;
  if (normalized.includes('rakuten')) return `https://rakuten.tv/es/search?q=${q}`;
  if (normalized.includes('skyshowtime')) return `https://www.skyshowtime.com/es/search?q=${q}`;
  if (normalized.includes('crunchyroll')) return `https://www.crunchyroll.com/search?q=${q}`;

  return fallback || null;
}
