const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── HELPERS ──
function seriesRow(row) {
  // Normalise a grouped series row to look like a movie row
  return {
    ...row,
    id:           null,
    is_series:    true,
    poster_path:  row.series_poster || row.poster_path,
    title:        row.series_title  || row.title,
  };
}

// ── LIST ──
router.get('/', (req, res) => {
  const { type, genre, search, limit = 50, offset = 0 } = req.query;
  let query  = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (type && type !== 'all') { query += ' AND type = ?'; params.push(type); }
  if (genre)  { query += ' AND genres LIKE ?'; params.push(`%${genre}%`); }
  if (search) { query += ' AND (title LIKE ? OR original_title LIKE ? OR series_title LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  query += ' ORDER BY added_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows  = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM movies').get().count;
  res.json({ results: rows, total });
});

// ── FEATURED (hero) — movies + one entry per series ──
router.get('/featured', (req, res) => {
  // Movies / documentaries with backdrop
  const movies = db.prepare(`
    SELECT * FROM movies
    WHERE type IN ('movie','documentary')
      AND backdrop_path IS NOT NULL AND backdrop_path != ''
      AND poster_path   IS NOT NULL AND poster_path   != ''
    ORDER BY views DESC, rating DESC NULLS LAST, added_at DESC
    LIMIT 4
  `).all();

  // One representative entry per series (highest-rated episode)
  const series = db.prepare(`
    SELECT
      series_id, series_title AS title, series_poster AS poster_path,
      backdrop_path, year, rating, genres, description,
      'tv' AS type, COUNT(*) AS episode_count,
      MAX(views) AS views, MAX(added_at) AS added_at,
      1 AS is_series
    FROM movies
    WHERE type = 'tv'
      AND series_title  IS NOT NULL AND series_title  != ''
      AND backdrop_path IS NOT NULL AND backdrop_path != ''
    GROUP BY COALESCE(CAST(series_id AS TEXT), series_title)
    ORDER BY MAX(views) DESC, MAX(rating) DESC NULLS LAST
    LIMIT 4
  `).all();

  // Mix and shuffle
  const combined = [...movies, ...series].sort(() => Math.random() - 0.5).slice(0, 7);
  res.json(combined);
});

// ── RECENT — movies + unique series only ──
router.get('/recent', (req, res) => {
  const movies = db.prepare(`
    SELECT * FROM movies
    WHERE type IN ('movie','documentary')
    ORDER BY added_at DESC LIMIT 20
  `).all();

  const series = db.prepare(`
    SELECT
      series_id, series_title AS title, series_poster AS poster_path,
      backdrop_path, year, rating, genres, description,
      'tv' AS type, COUNT(*) AS episode_count,
      MAX(added_at) AS added_at, 1 AS is_series
    FROM movies
    WHERE type = 'tv' AND series_title IS NOT NULL AND series_title != ''
    GROUP BY COALESCE(CAST(series_id AS TEXT), series_title)
    ORDER BY MAX(added_at) DESC LIMIT 20
  `).all();

  // Merge sorted by added_at
  const all = [...movies, ...series]
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
    .slice(0, 20);

  res.json(all);
});

// ── TOP RATED — movies only (no episodes) ──
router.get('/top', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM movies
    WHERE type IN ('movie','documentary') AND rating IS NOT NULL AND rating > 0
    ORDER BY rating DESC LIMIT 15
  `).all();
  res.json(rows);
});

// ── SINGLE ──
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// ── EXTRAS (trailer + cast + similar) ──
router.get('/:id/extras', async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  if (!movie.tmdb_id) return res.json({ trailer: null, cast: [], similar: [] });

  const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
  const fetch    = require('node-fetch');
  const type     = movie.type === 'tv' ? 'tv' : 'movie';
  const base     = `https://api.themoviedb.org/3/${type}/${movie.tmdb_id}`;

  async function tmdb(url, lang = 'es-ES') {
    const u = new URL(url);
    u.searchParams.set('api_key', TMDB_KEY);
    u.searchParams.set('language', lang);
    return fetch(u.toString()).then(r => r.json());
  }

  try {
    const [videosEs, credits, similar] = await Promise.all([
      tmdb(`${base}/videos`),
      tmdb(`${base}/credits`),
      tmdb(`${base}/recommendations`),
    ]);

    let trailerKey = (videosEs.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key;
    if (!trailerKey) {
      const enVid = await tmdb(`${base}/videos`, 'en-US');
      trailerKey = (enVid.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null;
    }

    const cast = (credits.cast || []).slice(0, 15).map(a => ({
      id: a.id, name: a.name, character: a.character, profile_path: a.profile_path,
    }));

    const director = (credits.crew || [])
      .filter(c => c.job === 'Director').slice(0, 2).map(c => c.name).join(', ');

    const similarTmdbIds = (similar.results || []).slice(0, 12).map(r => r.id);
    const inLibrary = similarTmdbIds.length
      ? db.prepare(`SELECT * FROM movies WHERE tmdb_id IN (${similarTmdbIds.map(() => '?').join(',')}) LIMIT 10`).all(...similarTmdbIds)
      : [];

    const similarAll = (similar.results || []).slice(0, 10).map(r => ({
      tmdb_id:    r.id,
      title:      r.title || r.name,
      poster_path: r.poster_path,
      year:       parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
      rating:     r.vote_average,
      in_library: inLibrary.some(m => m.tmdb_id === r.id),
      library_id: inLibrary.find(m => m.tmdb_id === r.id)?.id || null,
    }));

    res.json({ trailer: trailerKey, cast, director, similar: similarAll });
  } catch (err) {
    res.json({ trailer: null, cast: [], similar: [], error: err.message });
  }
});

// ── CRUD (admin) ──
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/', requireAdmin, (req, res) => {
  const { title, original_title, year, description, genres, director, cast, rating, duration, type, poster_path, backdrop_path, tmdb_id, file_path, file_size } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare(`
    INSERT INTO movies (title,original_title,year,description,genres,director,cast,rating,duration,type,poster_path,backdrop_path,tmdb_id,file_path,file_size)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(title,original_title,year,description,genres,director,cast,rating,duration,type||'movie',poster_path,backdrop_path,tmdb_id,file_path,file_size);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', requireAdmin, (req, res) => {
  const fields = ['title','original_title','year','description','genres','director','cast','rating','duration','type','poster_path','backdrop_path','tmdb_id','file_path'];
  const updates = []; const values = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.params.id);
  db.prepare(`UPDATE movies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
