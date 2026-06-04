const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const db      = require('../db');
const path    = require('path');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';
const { getLang, getImgLang } = require('../settings');

async function tmdb(endpoint, params = {}, lang) {
  const l = lang ?? getLang();
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  if (l) url.searchParams.set('language', l);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

async function tmdbWithFallback(endpoint, params = {}) {
  const primary = await tmdb(endpoint, params);
  if (!primary.overview) {
    const en = await tmdb(endpoint, params, 'en-US').catch(() => ({}));
    primary.overview = en.overview || primary.overview || '';
  }
  return primary;
}

const { requireAdmin } = require('../middleware');

function cleanSeriesName(value = '') {
  let name = String(value || '').replace(/\.[^.]+$/, '');
  name = name
    .replace(/[._-]+/g, ' ')
    .replace(/\b(?:season|temporada)\s*\d+\b.*$/i, '')
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b.*$/i, '')
    .replace(/\bS\d{1,2}\b.*$/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b.*$/i, '')
    .replace(/\((?:19|20)\d{2}\)/g, '')
    .replace(/\b(?:720p|1080p|2160p|web[- ]?dl|webrip|bluray|bdrip|x264|x265|h264|h265|hevc|aac|dts|dual|multi|spanish|castellano|latino|subs|hdo|hdolimpo|pack)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name;
}

function mediaSeriesFolder(row) {
  const parts = String(row.file_path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const mediaIdx = parts.findIndex(p => p.toLowerCase() === 'media');
  if (mediaIdx >= 0) {
    const root = parts[mediaIdx + 1]?.toLowerCase() || '';
    if (root.includes('series') && parts[mediaIdx + 2]) return cleanSeriesName(parts[mediaIdx + 2]);
  }
  return '';
}

function parseEpisodeInfo(row) {
  if (row.season_number && row.episode_number) {
    return { season: Number(row.season_number), episode: Number(row.episode_number) };
  }

  const base = path.basename(String(row.file_path || row.title || ''));
  const sources = [base, row.title, row.episode_title, row.file_path].filter(Boolean).map(String);

  for (const source of sources) {
    let m = source.match(/[Ss](\d{1,2})\s*[Ee](\d{1,3})/);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };

    m = source.match(/\b(\d{1,2})[xX](\d{1,3})\b/);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };

    m = source.match(/(?:season|temporada)\s*(\d{1,2}).{0,25}?(?:episode|episodio|cap[ií]tulo|cap\.?|ep\.?|e)\s*(\d{1,3})/i);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };

    m = source.match(/(?:season|temporada)\s*(\d{1,2})\D+(\d{1,3})(?!\d)/i);
    if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  }

  const pathText = String(row.file_path || '');
  const seasonMatch = pathText.match(/(?:season|temporada|\bS)\s*(\d{1,2})\b/i);
  const epMatch = base.match(/(?:^|\D)(?:episode|episodio|cap[ií]tulo|cap\.?|ep\.?|e)\s*(\d{1,3})(?!\d)/i);
  if (seasonMatch && epMatch) return { season: Number(seasonMatch[1]), episode: Number(epMatch[1]) };

  return { season: row.season_number || null, episode: row.episode_number || null };
}

function seriesTitleFor(row) {
  const folder = mediaSeriesFolder(row);
  if (folder) return folder;

  const explicit = cleanSeriesName(row.series_title);
  if (explicit) return explicit;

  return cleanSeriesName(row.title) || row.title || 'Serie sin título';
}

function seriesKeyFor(row) {
  if (row.series_id) return `id:${row.series_id}`;
  const title = seriesTitleFor(row);
  return `title:${title.toLowerCase()}`;
}

function normalizeEpisode(row) {
  const epInfo = parseEpisodeInfo(row);
  const seriesTitle = seriesTitleFor(row);
  return {
    ...row,
    season_number: epInfo.season || row.season_number || 1,
    episode_number: epInfo.episode || row.episode_number || 0,
    series_key: seriesKeyFor({ ...row, series_title: seriesTitle }),
    series_title: seriesTitle,
    series_poster: row.series_poster || row.poster_path,
  };
}

function episodeMatchesKey(ep, key) {
  const normalizedKey = String(key || '').toLowerCase();
  const normalizedAlias = normalizedKey.replace(/^sid:/, 'id:').replace(/^st:/, 'title:');
  const keyNoPrefix = normalizedAlias.replace(/^(id:|title:)/, '');
  const cleanStr = s => String(s || '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return ep.series_key === key ||
    String(ep.series_key || '').toLowerCase() === normalizedAlias ||
    String(ep.series_id || '') === key ||
    String(ep.series_id || '') === keyNoPrefix ||
    ep.series_title === key ||
    String(ep.series_title || '').toLowerCase() === normalizedAlias.replace(/^title:/, '') ||
    cleanStr(ep.series_title) === cleanStr(keyNoPrefix);
}

function titleVariations(raw) {
  const title = cleanSeriesName(raw);
  const variations = [title];
  variations.push(title.replace(/^(el|la|los|las|the|un|una)\s+/i, '').trim());
  variations.push(title.replace(/\s*[:\-–—].*$/, '').trim());
  variations.push(title.replace(/\s*\((?:19|20)\d{2}\).*$/, '').trim());
  return [...new Set(variations)].filter(v => v.length > 1);
}

async function findSeriesTmdbId(episodes, seriesTitle) {
  const existing = episodes.find(ep => ep.series_id || ep.tmdb_id);
  if (existing) return Number(existing.series_id || existing.tmdb_id);

  let best = null;
  for (const q of titleVariations(seriesTitle)) {
    const data = await tmdb('/search/tv', { query: q }).catch(() => null);
    const result = data?.results?.[0];
    if (result?.id) { best = result; break; }
  }
  return best?.id || null;
}

function episodeNeedsMetadata(ep) {
  return !ep.series_id || !ep.season_number || !ep.episode_number || !ep.episode_title || !ep.description || !ep.poster_path;
}

async function enrichSeriesEpisodes(episodes, force = false) {
  if (!episodes.length) return { updated: 0, tmdb_id: null, skipped: true };
  if (!force && !episodes.some(episodeNeedsMetadata)) {
    return { updated: 0, tmdb_id: episodes.find(ep => ep.series_id || ep.tmdb_id)?.series_id || null, skipped: true };
  }

  const seriesTitle = episodes[0].series_title;
  const tmdbId = await findSeriesTmdbId(episodes, seriesTitle);
  if (!tmdbId) return { updated: 0, tmdb_id: null, skipped: true, reason: 'tmdb_not_found' };

  const detail = await tmdbWithFallback(`/tv/${tmdbId}`);
  const genres = detail.genres?.map(g => g.name).join(', ') || episodes[0].genres || '';
  const canonicalTitle = detail.name || detail.original_name || seriesTitle;
  const year = parseInt((detail.first_air_date || '').slice(0, 4)) || episodes[0].year || null;
  const seriesPoster = detail.poster_path || episodes[0].series_poster || episodes[0].poster_path || '';
  const backdrop = detail.backdrop_path || episodes[0].backdrop_path || '';
  const seriesOverview = detail.overview || episodes[0].description || '';

  const seasonNumbers = [...new Set(episodes.map(ep => Number(ep.season_number || 1)).filter(n => n >= 0))].sort((a, b) => a - b);
  const seasonData = new Map();
  for (const seasonNumber of seasonNumbers) {
    const es = await tmdb(`/tv/${tmdbId}/season/${seasonNumber}`).catch(() => null);
    const en = es && (es.overview || es.episodes?.some(ep => ep.overview))
      ? null
      : await tmdb(`/tv/${tmdbId}/season/${seasonNumber}`, {}, 'en-US').catch(() => null);
    const season = es || en;
    if (!season) continue;

    const episodeMap = new Map();
    for (const ep of season.episodes || []) {
      const fallbackEp = (en?.episodes || []).find(e => e.episode_number === ep.episode_number);
      episodeMap.set(Number(ep.episode_number), {
        ...ep,
        overview: ep.overview || fallbackEp?.overview || '',
        name: ep.name || fallbackEp?.name || '',
        still_path: ep.still_path || fallbackEp?.still_path || '',
      });
    }
    seasonData.set(seasonNumber, { ...season, episodes: episodeMap });
  }

  const update = db.prepare(`
    UPDATE movies SET
      title = ?, original_title = ?, year = ?, description = ?, genres = ?, rating = ?, duration = ?,
      poster_path = ?, backdrop_path = ?, tmdb_id = ?, season_number = ?, episode_number = ?,
      episode_title = ?, episode_air_date = ?, series_id = ?, series_title = ?, series_poster = ?
    WHERE id = ?
  `);

  let updated = 0;
  const tx = db.transaction(items => {
    for (const ep of items) {
      const seasonNumber = Number(ep.season_number || 1);
      const episodeNumber = Number(ep.episode_number || 0);
      const tmdbEpisode = seasonData.get(seasonNumber)?.episodes?.get(episodeNumber);
      const episodeTitle = tmdbEpisode?.name || ep.episode_title || (episodeNumber ? `Episodio ${episodeNumber}` : ep.title);
      const description = tmdbEpisode?.overview || ep.description || seriesOverview;
      const still = tmdbEpisode?.still_path || ep.poster_path || seriesPoster;
      const rating = tmdbEpisode?.vote_average || detail.vote_average || ep.rating || null;
      const runtime = tmdbEpisode?.runtime || detail.episode_run_time?.[0] || ep.duration || null;
      const title = episodeNumber
        ? `${canonicalTitle} — T${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')} — ${episodeTitle}`
        : `${canonicalTitle} — ${episodeTitle}`;

      const result = update.run(
        title,
        detail.original_name || canonicalTitle,
        year,
        description,
        genres,
        rating,
        runtime,
        still,
        backdrop,
        tmdbId,
        seasonNumber,
        episodeNumber || null,
        episodeTitle,
        tmdbEpisode?.air_date || ep.episode_air_date || null,
        tmdbId,
        canonicalTitle,
        seriesPoster,
        ep.id
      );
      updated += result.changes;
    }
  });

  tx(episodes);
  return { updated, tmdb_id: tmdbId, title: canonicalTitle, seasons: seasonNumbers.length };
}

function loadEpisodesForKey(key) {
  return db.prepare(`
    SELECT * FROM movies
    WHERE type = ?
    ORDER BY COALESCE(season_number, 999), COALESCE(episode_number, 999), title
  `).all('tv')
    .map(normalizeEpisode)
    .filter(ep => episodeMatchesKey(ep, key));
}

function buildSeriesPayload(episodes, enrichment = null) {
  const seasons = {};
  episodes.forEach(ep => {
    const s = ep.season_number || 1;
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  });
  Object.values(seasons).forEach(eps => eps.sort((a, b) =>
    (a.episode_number || 0) - (b.episode_number || 0) || String(a.title).localeCompare(String(b.title))
  ));

  const first = episodes.find(ep => ep.series_poster || ep.poster_path || ep.backdrop_path || ep.description) || episodes[0];
  return {
    series_key: first.series_key,
    series_id: first.series_id,
    tmdb_id: first.series_id || first.tmdb_id,
    series_title: first.series_title,
    series_poster: first.series_poster || first.poster_path,
    backdrop_path: first.backdrop_path,
    description: first.description,
    genres: first.genres,
    rating: first.rating,
    year: first.year,
    seasons,
    season_count: Object.keys(seasons).length,
    episode_count: episodes.length,
    enrichment,
  };
}

// GET /api/series ? unique series, one card per show.
router.get('/', (req, res) => {
  const { search, limit = 300 } = req.query;
  let rows = db.prepare(`
    SELECT * FROM movies
    WHERE type = 'tv'
    ORDER BY added_at DESC
    LIMIT ?
  `).all(Math.max(Number(limit) * 20, 1000));

  rows = rows.map(normalizeEpisode);
  const map = new Map();
  for (const ep of rows) {
    if (search && !ep.series_title.toLowerCase().includes(String(search).toLowerCase())) continue;
    const existing = map.get(ep.series_key);
    if (!existing) {
      map.set(ep.series_key, {
        series_key: ep.series_key,
        series_id: ep.series_id,
        tmdb_id: ep.tmdb_id,
        title: ep.series_title,
        series_title: ep.series_title,
        poster_path: ep.series_poster || ep.poster_path,
        series_poster: ep.series_poster || ep.poster_path,
        backdrop_path: ep.backdrop_path,
        year: ep.year,
        rating: ep.rating,
        genres: ep.genres,
        description: ep.description,
        episode_count: 1,
        season_count: ep.season_number ? 1 : 0,
        _season_numbers: new Set(ep.season_number ? [ep.season_number] : []),
        added_at: ep.added_at,
        views: ep.views || 0,
        type: 'tv',
        is_series: 1,
      });
    } else {
      existing.episode_count += 1;
      if (ep.season_number) existing._season_numbers.add(ep.season_number);
      existing.season_count = existing._season_numbers.size;
      existing.views = Math.max(existing.views || 0, ep.views || 0);
      existing.rating = Math.max(existing.rating || 0, ep.rating || 0) || existing.rating;
      existing.poster_path = existing.poster_path || ep.series_poster || ep.poster_path;
      existing.series_poster = existing.series_poster || ep.series_poster || ep.poster_path;
      existing.backdrop_path = existing.backdrop_path || ep.backdrop_path;
      existing.description = existing.description || ep.description;
      existing.genres = existing.genres || ep.genres;
      existing.year = existing.year || ep.year;
      existing.series_id = existing.series_id || ep.series_id;
      existing.tmdb_id = existing.tmdb_id || ep.tmdb_id;
      if (new Date(ep.added_at) > new Date(existing.added_at)) existing.added_at = ep.added_at;
    }
  }

  const results = [...map.values()]
    .map(item => { delete item._season_numbers; return item; })
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
    .slice(0, Number(limit));
  res.json({ results, total: results.length });
});

// GET /api/series/:series_key/seasons
router.get('/:key/seasons', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    let episodes = loadEpisodesForKey(key);

    if (!episodes.length) return res.status(404).json({ error: 'Serie no encontrada', key });

    let enrichment = null;
    try {
      enrichment = await enrichSeriesEpisodes(episodes, false);
      if (enrichment?.updated) episodes = loadEpisodesForKey(key);
    } catch (err) {
      console.error('Series metadata enrichment failed:', err.message);
      enrichment = { error: err.message };
    }

    res.json(buildSeriesPayload(episodes, enrichment));
  } catch (err) {
    console.error('Error loading series seasons:', err);
    res.status(500).json({ error: 'Error al cargar la serie' });
  }
});

// POST /api/series/:key/set-tmdb — set a specific TMDB series ID and re-enrich all episodes
router.post('/:key/set-tmdb', requireAdmin, async (req, res) => {
  try {
    const key    = decodeURIComponent(req.params.key);
    const { tmdb_id } = req.body || {};
    if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id required' });

    let episodes = loadEpisodesForKey(key);
    if (!episodes.length) return res.status(404).json({ error: 'Serie no encontrada', key });

    // Pre-set series_id on every episode so enrichSeriesEpisodes uses this TMDB ID
    const stmt = db.prepare('UPDATE movies SET series_id = ? WHERE id = ?');
    const tx   = db.transaction(eps => { for (const ep of eps) stmt.run(Number(tmdb_id), ep.id); });
    tx(episodes);

    // Re-load and force full enrichment with the correct ID
    episodes = loadEpisodesForKey(key);
    const enrichment = await enrichSeriesEpisodes(episodes, true);
    const refreshed  = loadEpisodesForKey(key);
    res.json({ ok: true, ...enrichment, series: buildSeriesPayload(refreshed, enrichment) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error identificando serie' });
  }
});

// POST /api/series/:series_key/refresh-metadata
router.post('/:key/refresh-metadata', requireAdmin, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const episodes = loadEpisodesForKey(key);
    if (!episodes.length) return res.status(404).json({ error: 'Serie no encontrada', key });

    const enrichment = await enrichSeriesEpisodes(episodes, true);
    const refreshed = loadEpisodesForKey(key);
    res.json({ ok: true, ...enrichment, series: buildSeriesPayload(refreshed, enrichment) });
  } catch (err) {
    console.error('Error refreshing series metadata:', err);
    res.status(500).json({ error: err.message || 'Error identificando metadatos de la serie' });
  }
});

module.exports = router;
