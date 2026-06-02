const express = require('express');
const router  = express.Router();
const db      = require('../db');
const fetch   = require('node-fetch');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdb(endpoint, params = {}, lang = 'es-ES') {
  const u = new URL(`${TMDB_BASE}${endpoint}`);
  if (lang !== null) u.searchParams.set('language', lang);
  u.searchParams.set('api_key', TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

function providerSummary(providers) {
  const es = providers?.results?.ES || null;
  if (!es) return { region: 'ES', link: null, flatrate: [], rent: [], buy: [] };
  const map = arr => (arr || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
  return { region: 'ES', link: es.link || null, flatrate: map(es.flatrate), rent: map(es.rent), buy: map(es.buy) };
}

function inLibraryByTmdbIds(ids) {
  if (!ids.length) return [];
  return db.prepare(`SELECT * FROM movies WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
}

// LIST
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
  const totalQuery = type && type !== 'all'
    ? db.prepare('SELECT COUNT(*) as count FROM movies WHERE type = ?').get(type).count
    : db.prepare('SELECT COUNT(*) as count FROM movies').get().count;
  res.json({ results: rows, total: totalQuery });
});

// FEATURED (hero) ? movies + one entry per series
router.get('/featured', (req, res) => {
  const movies = db.prepare(`
    SELECT * FROM movies
    WHERE type IN ('movie','documentary')
      AND backdrop_path IS NOT NULL AND backdrop_path != ''
      AND poster_path   IS NOT NULL AND poster_path   != ''
    ORDER BY views DESC, rating DESC NULLS LAST, added_at DESC
    LIMIT 4
  `).all();

  const series = db.prepare(`
    SELECT
      series_id,
      COALESCE(NULLIF(series_title, ''), title) AS title,
      COALESCE(NULLIF(series_title, ''), title) AS series_title,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS poster_path,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS series_poster,
      backdrop_path, MIN(year) AS year, MAX(rating) AS rating, genres, description,
      'tv' AS type, COUNT(*) AS episode_count,
      MAX(views) AS views, MAX(added_at) AS added_at,
      1 AS is_series
    FROM movies
    WHERE type = 'tv' AND backdrop_path IS NOT NULL AND backdrop_path != ''
    GROUP BY COALESCE(CAST(series_id AS TEXT), NULLIF(series_title, ''), title)
    ORDER BY MAX(views) DESC, MAX(rating) DESC NULLS LAST
    LIMIT 4
  `).all();

  const combined = [...movies, ...series].sort(() => Math.random() - 0.5).slice(0, 7);
  res.json(combined);
});

// RECENT ? movies + unique series only
router.get('/recent', (req, res) => {
  const movies = db.prepare(`
    SELECT * FROM movies
    WHERE type IN ('movie','documentary')
    ORDER BY added_at DESC LIMIT 20
  `).all();

  const series = db.prepare(`
    SELECT
      series_id,
      COALESCE(NULLIF(series_title, ''), title) AS title,
      COALESCE(NULLIF(series_title, ''), title) AS series_title,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS poster_path,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS series_poster,
      backdrop_path, MIN(year) AS year, MAX(rating) AS rating, genres, description,
      'tv' AS type, COUNT(*) AS episode_count,
      MAX(added_at) AS added_at, 1 AS is_series
    FROM movies
    WHERE type = 'tv'
    GROUP BY COALESCE(CAST(series_id AS TEXT), NULLIF(series_title, ''), title)
    ORDER BY MAX(added_at) DESC LIMIT 20
  `).all();

  const all = [...movies, ...series]
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
    .slice(0, 20);

  res.json(all);
});

// TOP RATED — supports ?type=movie|documentary|tv and ?limit=N
router.get('/top', (req, res) => {
  const { type, limit = 15 } = req.query;
  const n = Number(limit);

  if (type === 'tv') {
    // Group episodes into series, sort by max rating
    const rows = db.prepare(`
      SELECT series_id,
        COALESCE(NULLIF(series_title,''), title)           AS title,
        COALESCE(NULLIF(series_title,''), title)           AS series_title,
        COALESCE(NULLIF(series_poster,''), poster_path)    AS poster_path,
        COALESCE(NULLIF(series_poster,''), poster_path)    AS series_poster,
        backdrop_path, MIN(year) AS year, MAX(rating) AS rating,
        genres, description, 'tv' AS type,
        COUNT(*) AS episode_count, 1 AS is_series
      FROM movies
      WHERE type = 'tv' AND rating IS NOT NULL AND rating > 0
      GROUP BY COALESCE(CAST(series_id AS TEXT), NULLIF(series_title,''), title)
      ORDER BY MAX(rating) DESC LIMIT ?
    `).all(n);
    return res.json(rows);
  }

  let query = 'SELECT * FROM movies WHERE rating IS NOT NULL AND rating > 0';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  else       { query += " AND type IN ('movie','documentary')"; }
  query += ' ORDER BY rating DESC LIMIT ?';
  params.push(n);
  res.json(db.prepare(query).all(...params));
});

// NEXT EPISODE
router.get('/:id/next', (req, res) => {
  const ep = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!ep || ep.type !== 'tv') return res.json({ next: null });

  let next = null;
  if (ep.series_id) {
    next = db.prepare(`
      SELECT * FROM movies
      WHERE type='tv' AND series_id = ?
        AND (COALESCE(season_number,1) > COALESCE(?,1)
          OR (COALESCE(season_number,1) = COALESCE(?,1) AND COALESCE(episode_number,0) > COALESCE(?,0)))
      ORDER BY COALESCE(season_number,1), COALESCE(episode_number,0), title
      LIMIT 1
    `).get(ep.series_id, ep.season_number, ep.season_number, ep.episode_number);
  }

  if (!next && ep.series_title) {
    next = db.prepare(`
      SELECT * FROM movies
      WHERE type='tv' AND series_title = ? AND id != ?
        AND (COALESCE(season_number,1) > COALESCE(?,1)
          OR (COALESCE(season_number,1) = COALESCE(?,1) AND COALESCE(episode_number,0) > COALESCE(?,0)))
      ORDER BY COALESCE(season_number,1), COALESCE(episode_number,0), title
      LIMIT 1
    `).get(ep.series_title, ep.id, ep.season_number, ep.season_number, ep.episode_number);
  }

  res.json({ next });
});

// EXTRAS (trailer + cast + similar + providers)
router.get('/:id/extras', async (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });
  if (!movie.tmdb_id) return res.json({ trailer: null, cast: [], similar: [], providers: providerSummary(null) });

  const type = movie.tmdb_media_type || (movie.type === 'tv' ? 'tv' : 'movie');

  try {
    const [videosEs, credits, similar, providers] = await Promise.all([
      tmdb(`/${type}/${movie.tmdb_id}/videos`),
      tmdb(`/${type}/${movie.tmdb_id}/credits`),
      tmdb(`/${type}/${movie.tmdb_id}/recommendations`),
      tmdb(`/${type}/${movie.tmdb_id}/watch/providers`, {}, null),
    ]);

    let trailerKey = (videosEs.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key;
    if (!trailerKey) {
      const enVid = await tmdb(`/${type}/${movie.tmdb_id}/videos`, {}, 'en-US');
      trailerKey = (enVid.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null;
    }

    const cast = (credits.cast || []).slice(0, 15).map(a => ({
      id: a.id, name: a.name, character: a.character, profile_path: a.profile_path,
    }));

    const director = (credits.crew || [])
      .filter(c => c.job === 'Director').slice(0, 2).map(c => c.name).join(', ');

    const similarItems = (similar.results || []).slice(0, 10);
    const similarTmdbIds = similarItems.map(r => r.id);
    const inLibrary = inLibraryByTmdbIds(similarTmdbIds);

    const similarAll = similarItems.map(r => {
      const lib = inLibrary.find(m => m.tmdb_id === r.id);
      return {
        tmdb_id:     r.id,
        media_type:  type,
        title:       r.title || r.name,
        poster_path: r.poster_path,
        year:        parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
        rating:      r.vote_average,
        in_library:  !!lib,
        library_id:  lib?.id || null,
      };
    });

    res.json({ trailer: trailerKey, cast, director, similar: similarAll, providers: providerSummary(providers) });
  } catch (err) {
    res.json({ trailer: null, cast: [], similar: [], providers: providerSummary(null), error: err.message });
  }
});

// PERSON DETAIL + FILMOGRAPHY
router.get('/person/:personId', async (req, res) => {
  try {
    const [person, combined] = await Promise.all([
      tmdb(`/person/${req.params.personId}`, {}, 'es-ES'),
      tmdb(`/person/${req.params.personId}/combined_credits`, {}, 'es-ES'),
    ]);

    const credits = (combined.cast || [])
      .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 24)
      .map(c => ({
        tmdb_id: c.id,
        media_type: c.media_type,
        title: c.title || c.name,
        character: c.character,
        poster_path: c.poster_path,
        year: parseInt((c.release_date || c.first_air_date || '').slice(0, 4)) || null,
        rating: c.vote_average,
      }));

    const ids = credits.map(c => c.tmdb_id);
    const inLibrary = inLibraryByTmdbIds(ids);
    credits.forEach(c => {
      const lib = inLibrary.find(m => m.tmdb_id === c.tmdb_id);
      c.in_library = !!lib;
      c.library_id = lib?.id || null;
    });

    res.json({ person, credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SINGLE
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// CRUD (admin)
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
