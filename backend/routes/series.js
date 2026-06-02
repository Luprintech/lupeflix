const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/series — unique series (one card per show)
router.get('/', (req, res) => {
  const { search } = req.query;
  let query = `
    SELECT
      series_id,
      series_title   AS title,
      series_poster  AS poster_path,
      backdrop_path,
      MAX(year)      AS year,
      MAX(rating)    AS rating,
      genres,
      description,
      COUNT(*)       AS episode_count,
      MAX(added_at)  AS added_at,
      MAX(views)     AS views
    FROM movies
    WHERE type = 'tv' AND series_title IS NOT NULL AND series_title != ''
  `;
  const params = [];
  if (search) { query += ' AND series_title LIKE ?'; params.push(`%${search}%`); }
  query += ' GROUP BY COALESCE(series_id, series_title) ORDER BY added_at DESC';

  const rows = db.prepare(query).all(...params);
  res.json({ results: rows, total: rows.length });
});

// GET /api/series/:series_id_or_title/seasons
router.get('/:key/seasons', (req, res) => {
  const key = req.params.key;
  const isNumeric = /^\d+$/.test(key);

  // Get all episodes for this series
  const episodes = isNumeric
    ? db.prepare('SELECT * FROM movies WHERE type="tv" AND series_id = ? ORDER BY season_number, episode_number').all(parseInt(key))
    : db.prepare('SELECT * FROM movies WHERE type="tv" AND series_title = ? ORDER BY season_number, episode_number').all(key);

  if (!episodes.length) return res.status(404).json({ error: 'Series not found' });

  // Group by season
  const seasons = {};
  episodes.forEach(ep => {
    const s = ep.season_number || 1;
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  });

  // Sort episodes within each season
  Object.values(seasons).forEach(eps => eps.sort((a, b) => (a.episode_number||0) - (b.episode_number||0)));

  res.json({
    series_title:  episodes[0].series_title,
    series_poster: episodes[0].series_poster,
    backdrop_path: episodes[0].backdrop_path,
    description:   episodes[0].description,
    genres:        episodes[0].genres,
    rating:        episodes[0].rating,
    year:          episodes[0].year,
    seasons,
    episode_count: episodes.length,
  });
});

module.exports = router;
