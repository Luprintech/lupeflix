/**
 * Re-fetch or identify metadata from TMDB for existing library entries.
 */
const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const db      = require('../db');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) return next();

  // Allow the configured admin email from the normal app, so admins can identify
  // metadata without opening the dashboard token flow.
  const token = req.headers['x-user-token'];
  if (token && process.env.ADMIN_EMAIL) {
    const session = db.prepare('SELECT user_email FROM sessions WHERE token = ?').get(token);
    if (session?.user_email === process.env.ADMIN_EMAIL) return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

async function tmdb(endpoint, lang = 'es-ES', extraParams = {}) {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  if (lang) url.searchParams.set('language', lang);
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

async function applyMetadata(movie, tmdbId, mediaType, saveType = null) {
  const lookupType = mediaType === 'tv' ? 'tv' : 'movie';
  const libraryType = saveType === 'documentary' ? 'documentary' : lookupType;
  const detail = await tmdb(`/${lookupType}/${tmdbId}`, 'es-ES');

  if (!detail.overview) {
    const en = await tmdb(`/${lookupType}/${tmdbId}`, 'en-US').catch(() => ({}));
    detail.overview = en.overview || '';
  }

  let posterPath = detail.poster_path;
  try {
    const images = await tmdb(`/${lookupType}/${tmdbId}/images`, '', { include_image_language: 'es,null' });
    const esPoster = (images.posters || []).find(p => p.iso_639_1 === 'es');
    if (esPoster) posterPath = esPoster.file_path;
  } catch {}

  let director = '', cast = '';
  try {
    const credits = await tmdb(`/${lookupType}/${tmdbId}/credits`, 'es-ES');
    director = (credits.crew || []).filter(c => c.job === 'Director').slice(0, 2).map(c => c.name).join(', ');
    cast     = (credits.cast || []).slice(0, 8).map(c => c.name).join(', ');
  } catch {}

  const title  = detail.title || detail.name;
  const genres = detail.genres?.map(g => g.name).join(', ') || movie.genres || '';
  const year   = parseInt((detail.release_date || detail.first_air_date || '').slice(0, 4)) || movie.year;

  db.prepare(`
    UPDATE movies SET
      title=?, original_title=?, year=?, description=?, genres=?, director=?, cast=?,
      rating=?, duration=?, poster_path=?, backdrop_path=?, tmdb_id=?, tmdb_media_type=?, type=?
    WHERE id=?
  `).run(
    title,
    detail.original_title || detail.original_name || movie.original_title || title,
    year,
    detail.overview || '',
    genres,
    director || movie.director,
    cast || movie.cast,
    detail.vote_average || movie.rating,
    detail.runtime || detail.episode_run_time?.[0] || movie.duration,
    posterPath || movie.poster_path,
    detail.backdrop_path || movie.backdrop_path,
    Number(tmdbId),
    lookupType,
    libraryType,
    movie.id
  );

  return { title, year, poster: posterPath, type: libraryType, tmdb_media_type: lookupType, tmdb_id: Number(tmdbId) };
}

// ── AUTO-SEARCH HELPERS ──
function cleanTitleForSearch(raw) {
  return String(raw || '')
    .replace(/\s*[–—-]\s*(?:T\d+E\d+|S\d+E\d+|Temporada|Season).*/i, '')
    .replace(/\b(?:BluRay|BDRip|WEB[-.]?DL|WEBRip|HDRip|DVDRip|1080p|720p|2160p|4K|x264|x265|HEVC|REMUX|PROPER|REPACK)\b.*/i, '')
    .replace(/\((?:19|20)\d{2}\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCandidates(raw) {
  const base = cleanTitleForSearch(raw);
  const results = [base];
  const noArticle = base.replace(/^(?:El|La|Los|Las|The|Un|Una)\s+/i, '').trim();
  if (noArticle !== base) results.push(noArticle);
  const noSub = base.replace(/\s*[:–—].*/g, '').trim();
  if (noSub !== base && noSub.length > 2) results.push(noSub);
  return [...new Set(results)].filter(t => t.length > 1);
}

async function autoFindOnTmdb(movie) {
  // For documentaries, try both movie and tv (many doc series are TV shows on TMDB)
  const typesToTry = movie.type === 'tv' ? ['tv']
    : movie.type === 'documentary' ? ['movie', 'tv']
    : ['movie'];

  for (const mediaType of typesToTry) {
    const endpoint = `/search/${mediaType}`;
    for (const q of titleCandidates(movie.title || movie.original_title || '')) {
      for (const year of movie.year ? [movie.year, null] : [null]) {
        try {
          const params = { query: q };
          if (year) params.year = year;
          const data = await tmdb(endpoint, 'es-ES', params);
          const r = (data.results || [])[0];
          if (r) return { tmdbId: r.id, mediaType };
        } catch {}
      }
    }
  }
  return null;
}

// POST /api/rematch/ids-missing — IDs without metadata (movies/docs only)
router.post('/ids-missing', requireAdmin, (req, res) => {
  const { type, limit = 500 } = req.body || {};
  let query  = "SELECT id FROM movies WHERE type != 'tv' AND (tmdb_id IS NULL OR tmdb_id = 0)";
  const params = [];
  if (type && type !== 'tv') { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY added_at DESC LIMIT ?';
  params.push(Number(limit));
  const ids = db.prepare(query).all(...params).map(r => r.id);
  res.json({ ok: true, count: ids.length, ids });
});

// POST /api/rematch/:id/auto — auto-find TMDB and apply metadata for items without it
router.post('/:id/auto', requireAdmin, async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  if (movie.tmdb_id) return res.json({ ok: true, skipped: true, title: movie.title });
  try {
    const found = await autoFindOnTmdb(movie);
    if (!found) return res.json({ ok: false, not_found: true, title: movie.title });
    const result = await applyMetadata(movie, found.tmdbId, found.mediaType, movie.type);
    res.json({ ok: true, source: 'auto', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rematch/:id/identify ? set TMDB ID manually and refresh metadata.
router.post('/:id/identify', requireAdmin, async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const { tmdb_id, type, save_type } = req.body || {};
  if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id required' });

  try {
    const result = await applyMetadata(movie, tmdb_id, type || movie.tmdb_media_type || movie.type || 'movie', save_type);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rematch/:id ? re-fetch metadata for one item with an existing TMDB ID.
router.post('/:id', requireAdmin, async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  if (!movie.tmdb_id) return res.status(400).json({ error: 'No TMDB ID ? use identify metadata' });

  const type = movie.tmdb_media_type || (movie.type === 'tv' ? 'tv' : 'movie');
  try {
    const result = await applyMetadata(movie, movie.tmdb_id, type);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rematch/batch ? returns IDs with TMDB data for the frontend batch worker.
router.post('/', requireAdmin, async (req, res) => {
  const { limit = 50, type } = req.body || {};
  let query = 'SELECT id FROM movies WHERE tmdb_id IS NOT NULL';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY added_at DESC LIMIT ?';
  params.push(Number(limit));

  const ids = db.prepare(query).all(...params).map(r => r.id);
  res.json({ ok: true, queued: ids.length, ids });
});

module.exports = router;
