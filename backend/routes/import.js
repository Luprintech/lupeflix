const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const db      = require('../db');
const path    = require('path');
const { omdb: omdbFetch, normalizeOmdb } = require('./omdb');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';

// ── LANGUAGE CHAIN: es-ES → en-US ──
// Always prefer Castilian Spanish. If overview is empty, backfill with English.
async function tmdb(endpoint, params = {}, lang = 'es-ES') {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', lang);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

async function tmdbWithFallback(endpoint, params = {}) {
  const es = await tmdb(endpoint, params, 'es-ES');
  // Backfill empty overview with English
  if (!es.overview && !es.results) {
    try {
      const en = await tmdb(endpoint, params, 'en-US');
      es.overview = en.overview || '';
    } catch {}
  }
  // Try to get Spanish poster
  if (es.id && !es.results) {
    try {
      const mediaType = es.title ? 'movie' : 'tv';
      const images = await tmdb(`/${mediaType}/${es.id}/images`, { include_image_language: 'es,null' }, '');
      const esPoster = (images.posters || []).find(p => p.iso_639_1 === 'es');
      if (esPoster) es.poster_path = esPoster.file_path;
    } catch {}
  }
  return es;
}

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── FILENAME PARSERS ──

// Parse title + year from any common naming pattern
function parseFilename(filename) {
  let name = filename.replace(/\.[^.]+$/, '');
  const yearMatch = name.match(/[\s\[\(._-]+((?:19|20)\d{2})[\s\]\)._-]/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;
  if (yearMatch) name = name.substring(0, yearMatch.index);
  name = name
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/\b(BluRay|BDRip|BDRemux|WEB[\-.]?DL|WEBRip|HDTV|DVDRip|PROPER|REPACK|EXTENDED|UNRATED|THEATRICAL|DIRECTORS|REMUX|HEVC|x265|x264|HDR|DOLBY|ATMOS|DTS|AC3|AAC|DD)\b.*/i, '')
    .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: name || filename, year };
}

// Generate multiple title variations to maximise TMDB hit rate
function titleVariations(raw) {
  const v = [raw];
  // Without leading articles (El, La, Los, Las, The, Un, Una)
  const noArticle = raw.replace(/^(El|La|Los|Las|The|Un|Una|Un|Los)\s+/i, '').trim();
  if (noArticle !== raw) v.push(noArticle);
  // First 3 words only (useful for very long names)
  const words = raw.split(' ');
  if (words.length > 3) v.push(words.slice(0, 3).join(' '));
  if (words.length > 2) v.push(words.slice(0, 2).join(' '));
  // Remove colon and everything after (subtitle)
  const noSub = raw.replace(/\s*:.*$/, '').trim();
  if (noSub !== raw && noSub.length > 2) v.push(noSub);
  // Remove parentheses content
  const noParen = raw.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (noParen !== raw && noParen.length > 2) v.push(noParen);
  return [...new Set(v)].filter(t => t.length > 1);
}

// Confidence score for a TMDB result vs expected title+year
function confidence(result, title, year) {
  const rTitle = (result.title || result.name || '').toLowerCase();
  const qTitle = title.toLowerCase();
  let score = rTitle === qTitle ? 100 : rTitle.includes(qTitle) ? 60 : qTitle.includes(rTitle) ? 50 : 20;
  if (year) {
    const rYear = parseInt((result.release_date || result.first_air_date || '').slice(0, 4));
    if (rYear === year) score += 30;
    else if (Math.abs(rYear - year) === 1) score += 15;
    else score -= 20;
  }
  return score;
}

// S01E01 / 1x01 detection
function parseEpisode(filename) {
  let m = filename.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  m = filename.match(/\b(\d{1,2})[xX](\d{1,3})\b/);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  m = filename.match(/(?:season|temporada)\s*(\d{1,2}).{0,25}?(?:episode|episodio|cap[ií]tulo|cap\.?|ep\.?|e)\s*(\d{1,3})/i);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  m = filename.match(/(?:season|temporada)\s*(\d{1,2})\D+(\d{1,3})(?!\d)/i);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]) };
  return null;
}

function parseSeriesTitle(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  let m = name.match(/^(.*?)[.\s_-]+[Ss]\d{1,2}[Ee]\d{1,3}/);
  if (m) return m[1].replace(/[._-]+/g, ' ').trim();
  m = name.match(/^(.*?)[.\s_-]+\d{1,2}[xX]\d{1,3}/);
  if (m) return m[1].replace(/[._-]+/g, ' ').trim();
  return parseFilename(filename).title;
}

// ── TMDB MULTI-STRATEGY SEARCH ──
async function searchTMDB(rawTitle, year, mediaType /* movie|tv */) {
  const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const variations = titleVariations(rawTitle);
  let bestResult = null;
  let bestScore  = 0;

  for (const variant of variations) {
    // Try with year first, then without
    for (const tryYear of year ? [year, null] : [null]) {
      try {
        const params = { query: variant };
        if (tryYear) params.year = tryYear;
        const data = await tmdb(endpoint, params, 'es-ES');
        const results = data.results || [];
        for (const r of results.slice(0, 5)) {
          const score = confidence(r, variant, tryYear);
          if (score > bestScore) { bestScore = score; bestResult = r; }
        }
        if (bestScore >= 80) break; // good enough
      } catch {}
    }
    if (bestScore >= 80) break;
  }

  return { result: bestResult, score: bestScore };
}

// ── OMDb FALLBACK ──
async function searchOMDb(rawTitle, year, mediaType) {
  try {
    const variations = titleVariations(rawTitle);
    for (const variant of variations) {
      try {
        const params = { t: variant, plot: 'full' };
        if (year) params.y = year;
        if (mediaType === 'tv') params.type = 'series';
        const data = await omdbFetch(params);
        if (data && data.Response !== 'False') return normalizeOmdb(data);
      } catch {}
    }
  } catch {}
  return null;
}

// ── MERGE: prefer TMDB for structure, OMDb for English fallback ──
async function fetchFullMetadata(tmdbId, mediaType, omdbData = null) {
  const detail = await tmdbWithFallback(`/${mediaType}/${tmdbId}`);

  // Fill gaps with OMDb data
  if (omdbData) {
    if (!detail.overview) detail.overview = omdbData.description || '';
    if (!detail.genres?.length && omdbData.genres) {
      detail.genres = omdbData.genres.split(',').map(g => ({ name: g.trim() }));
    }
  }

  // Credits
  let director = '', cast = '';
  try {
    const credits = await tmdb(`/${mediaType}/${tmdbId}/credits`, {}, 'es-ES');
    director = (credits.crew || []).filter(c => c.job === 'Director').slice(0, 2).map(c => c.name).join(', ');
    cast     = (credits.cast || []).slice(0, 6).map(c => c.name).join(', ');
  } catch {}

  // Use OMDb cast/director if TMDB credits empty
  if (!director && omdbData?.director) director = omdbData.director;
  if (!cast     && omdbData?.cast)     cast     = omdbData.cast;

  return { detail, director, cast };
}

// POST /api/import
router.post('/', requireAdmin, async (req, res) => {
  const { file_path, type = 'movie', file_size, tmdb_id } = req.body;
  if (!file_path) return res.status(400).json({ error: 'file_path required' });

  const existing = db.prepare('SELECT id, title FROM movies WHERE file_path = ?').get(file_path);
  if (existing) return res.json({ skipped: true, id: existing.id, title: existing.title });

  const filename  = path.basename(file_path);
  const isTv      = type === 'tv';
  const tmdbType  = isTv ? 'tv' : 'movie';

  // ── TV EPISODE ──
  if (isTv) {
    const epInfo    = parseEpisode(filename);
    const seriesRaw = parseSeriesTitle(filename);

    try {
      let seriesItem = null;
      let metaSource = 'none';

      if (tmdb_id) {
        seriesItem = await tmdbWithFallback(`/tv/${tmdb_id}`);
        metaSource = 'tmdb';
      } else {
        // Strategy 1: TMDB
        const { result, score } = await searchTMDB(seriesRaw, null, 'tv');
        if (result && score >= 40) {
          seriesItem = await tmdbWithFallback(`/tv/${result.id}`);
          metaSource = 'tmdb';
        }
        // Strategy 2: OMDb fallback
        if (!seriesItem) {
          const omdbResult = await searchOMDb(seriesRaw, null, 'tv');
          if (omdbResult) {
            seriesItem = { // fake TMDB-shaped object
              name: omdbResult.title, original_name: omdbResult.title,
              overview: omdbResult.description, vote_average: omdbResult.rating,
              poster_path: null, backdrop_path: null,
              first_air_date: omdbResult.year ? `${omdbResult.year}-01-01` : '',
              genres: [], id: null,
              _poster_url: omdbResult.poster_path, // full URL from OMDb
            };
            metaSource = 'omdb';
          }
        }
      }

      // Episode details
      let epDetails = null;
      if (seriesItem?.id && epInfo) {
        try { epDetails = await tmdb(`/tv/${seriesItem.id}/season/${epInfo.season}/episode/${epInfo.episode}`, {}, 'es-ES'); } catch {}
      }

      const seriesTitle  = seriesItem ? (seriesItem.name || seriesItem.original_name || seriesRaw) : seriesRaw;
      const epTitle      = epDetails?.name || (epInfo ? `Episodio ${epInfo.episode}` : filename);
      const genres       = seriesItem?.genres?.map(g => g.name).join(', ') || '';
      const posterPath   = seriesItem?._poster_url || seriesItem?.poster_path || '';
      const displayTitle = epInfo
        ? `${seriesTitle} — S${String(epInfo.season||1).padStart(2,'0')}E${String(epInfo.episode||0).padStart(2,'0')} — ${epTitle}`
        : `${seriesTitle} — ${epTitle}`;

      const result = db.prepare(`
        INSERT INTO movies
          (title, original_title, year, description, genres, rating, duration, type,
           poster_path, backdrop_path, tmdb_id, tmdb_media_type, file_path, file_size,
           season_number, episode_number, episode_title, series_id, series_title, series_poster)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        displayTitle,
        seriesItem?.original_name || seriesRaw,
        seriesItem ? parseInt((seriesItem.first_air_date || '').slice(0, 4)) || null : null,
        epDetails?.overview || seriesItem?.overview || '',
        genres,
        seriesItem?.vote_average || null,
        epDetails?.runtime || seriesItem?.episode_run_time?.[0] || null,
        'tv',
        epDetails?.still_path || posterPath,
        seriesItem?.backdrop_path || '',
        seriesItem?.id || null,
        'tv',
        file_path, file_size || null,
        epInfo?.season || null, epInfo?.episode || null, epTitle,
        seriesItem?.id || null, seriesTitle, posterPath
      );

      return res.json({
        ok: true, id: result.lastInsertRowid, title: displayTitle,
        tmdb_found: metaSource === 'tmdb', source: metaSource,
        series_title: seriesTitle, season: epInfo?.season, episode: epInfo?.episode,
      });

    } catch (err) {
      const result = db.prepare(
        'INSERT INTO movies (title, type, file_path, file_size, season_number, episode_number, series_title) VALUES (?,?,?,?,?,?,?)'
      ).run(seriesRaw, 'tv', file_path, file_size || null, epInfo?.season || null, epInfo?.episode || null, seriesRaw);
      return res.json({ ok: true, id: result.lastInsertRowid, title: seriesRaw, source: 'none', fallback: true });
    }
  }

  // ── MOVIE / DOCUMENTARY ──
  const { title: parsedTitle, year: parsedYear } = parseFilename(filename);
  let metaSource = 'none';

  try {
    let tmdbItem = null;
    let omdbData = null;

    if (tmdb_id) {
      const { detail } = await fetchFullMetadata(tmdb_id, tmdbType);
      tmdbItem = detail; metaSource = 'tmdb';
    } else {
      // Strategy 1: TMDB with multiple variations
      const { result, score } = await searchTMDB(parsedTitle, parsedYear, tmdbType);
      if (result && score >= 40) {
        const { detail, director, cast } = await fetchFullMetadata(result.id, tmdbType);
        tmdbItem = detail;
        tmdbItem._director = director;
        tmdbItem._cast     = cast;
        metaSource = 'tmdb';
      }

      // Strategy 2: OMDb fallback
      if (!tmdbItem || !tmdbItem.overview) {
        omdbData = await searchOMDb(parsedTitle, parsedYear, type);
        if (omdbData && !tmdbItem) metaSource = 'omdb';
      }

      // Strategy 3: Cross-reference — use OMDb IMDb ID to find TMDB record
      if (!tmdbItem && omdbData?.imdb_id) {
        try {
          const found = await tmdb(`/find/${omdbData.imdb_id}`, { external_source: 'imdb_id' }, 'es-ES');
          const r = (found.movie_results || found.tv_results || [])[0];
          if (r) {
            const { detail, director, cast } = await fetchFullMetadata(r.id, tmdbType);
            tmdbItem = detail;
            tmdbItem._director = director;
            tmdbItem._cast     = cast;
            metaSource = 'tmdb+omdb';
          }
        } catch {}
      }
    }

    const source  = metaSource;
    const title   = tmdbItem ? (tmdbItem.title || tmdbItem.name) : (omdbData?.title || parsedTitle);
    const year    = tmdbItem ? parseInt((tmdbItem.release_date||'').slice(0,4))||parsedYear : (omdbData?.year || parsedYear);
    const genres  = tmdbItem?.genres?.map(g=>g.name).join(', ') || omdbData?.genres || '';
    const desc    = tmdbItem?.overview || omdbData?.description || '';
    const poster  = tmdbItem?.poster_path || (omdbData?.poster_path?.startsWith('http') ? omdbData.poster_path : '') || '';
    const back    = tmdbItem?.backdrop_path || '';
    const dir     = tmdbItem?._director || omdbData?.director || '';
    const cast    = tmdbItem?._cast     || omdbData?.cast     || '';
    const rating  = tmdbItem?.vote_average || omdbData?.rating || null;
    const dur     = tmdbItem?.runtime || omdbData?.duration || null;

    const result = db.prepare(`
      INSERT INTO movies
        (title, original_title, year, description, genres, director, cast, rating, duration, type,
         poster_path, backdrop_path, tmdb_id, tmdb_media_type, file_path, file_size)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      title, tmdbItem?.original_title || omdbData?.title || parsedTitle || '',
      year, desc, genres, dir, cast, rating, dur, type,
      poster, back, tmdbItem?.id || null, tmdbItem ? tmdbType : null, file_path, file_size || null
    );

    res.json({ ok: true, id: result.lastInsertRowid, title, year, source, tmdb_found: source !== 'none' });

  } catch (err) {
    try {
      const result = db.prepare(
        'INSERT INTO movies (title, year, type, file_path, file_size) VALUES (?,?,?,?,?)'
      ).run(parsedTitle, parsedYear, type, file_path, file_size || null);
      res.json({ ok: true, id: result.lastInsertRowid, title: parsedTitle, source: 'none', fallback: true });
    } catch (dbErr) { res.status(500).json({ error: dbErr.message }); }
  }
});

module.exports = router;
