/**
 * Re-fetch metadata from TMDB for existing library entries
 * Useful to fix language (es-MX → es-ES) or update posters
 */
const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const db      = require('../db');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
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

// POST /api/rematch/:id — re-fetch metadata for one movie
router.post('/:id', requireAdmin, async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  if (!movie.tmdb_id) return res.status(400).json({ error: 'No TMDB ID — use manual edit' });

  const type = movie.type === 'tv' ? 'tv' : 'movie';
  try {
    const detail = await tmdb(`/${type}/${movie.tmdb_id}`, 'es-ES');

    // Backfill overview if empty
    if (!detail.overview) {
      const en = await tmdb(`/${type}/${movie.tmdb_id}`, 'en-US').catch(() => ({}));
      detail.overview = en.overview || '';
    }

    // Try Spanish poster
    let posterPath = detail.poster_path;
    try {
      const images = await tmdb(`/${type}/${movie.tmdb_id}/images`, '', { include_image_language: 'es,null' });
      const esPoster = (images.posters || []).find(p => p.iso_639_1 === 'es');
      if (esPoster) posterPath = esPoster.file_path;
    } catch {}

    // Credits
    let director = '', cast = '';
    try {
      const credits = await tmdb(`/${type}/${movie.tmdb_id}/credits`, 'es-ES');
      director = (credits.crew || []).filter(c => c.job === 'Director').slice(0, 2).map(c => c.name).join(', ');
      cast     = (credits.cast || []).slice(0, 6).map(c => c.name).join(', ');
    } catch {}

    const title  = detail.title || detail.name;
    const genres = detail.genres?.map(g => g.name).join(', ') || movie.genres || '';
    const year   = parseInt((detail.release_date || detail.first_air_date || '').slice(0, 4)) || movie.year;

    db.prepare(`
      UPDATE movies SET
        title=?, year=?, description=?, genres=?, director=?, cast=?,
        rating=?, duration=?, poster_path=?, backdrop_path=?
      WHERE id=?
    `).run(
      title, year, detail.overview || '', genres, director || movie.director, cast || movie.cast,
      detail.vote_average || movie.rating,
      detail.runtime || detail.episode_run_time?.[0] || movie.duration,
      posterPath || movie.poster_path, detail.backdrop_path || movie.backdrop_path,
      movie.id
    );

    res.json({ ok: true, title, year, poster: posterPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rematch/batch — re-fetch all that have tmdb_id
router.post('/', requireAdmin, async (req, res) => {
  const { limit = 50, type } = req.body;
  let query = 'SELECT id FROM movies WHERE tmdb_id IS NOT NULL';
  if (type) query += ` AND type = '${type}'`;
  query += ` ORDER BY added_at DESC LIMIT ${Number(limit)}`;

  const ids = db.prepare(query).all().map(r => r.id);
  res.json({ ok: true, queued: ids.length, ids });
});

module.exports = router;
