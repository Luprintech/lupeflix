const express = require('express');
const router  = express.Router();
const db      = require('../db');

function seriesKeyExpr() {
  return "COALESCE(CAST(series_id AS TEXT), NULLIF(series_title, ''), title)";
}

// GET /api/series ? unique series (one card per show)
router.get('/', (req, res) => {
  const { search, limit = 300 } = req.query;
  let query = `
    SELECT
      series_id,
      COALESCE(NULLIF(series_title, ''), title) AS title,
      COALESCE(NULLIF(series_title, ''), title) AS series_title,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS poster_path,
      COALESCE(NULLIF(series_poster, ''), poster_path) AS series_poster,
      backdrop_path,
      MIN(year)      AS year,
      MAX(rating)    AS rating,
      genres,
      description,
      COUNT(*)       AS episode_count,
      MAX(added_at)  AS added_at,
      MAX(views)     AS views,
      1              AS is_series
    FROM movies
    WHERE type = 'tv'
  `;
  const params = [];
  if (search) {
    query += " AND (series_title LIKE ? OR title LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ` GROUP BY ${seriesKeyExpr()} ORDER BY added_at DESC LIMIT ?`;
  params.push(Number(limit));

  const rows = db.prepare(query).all(...params);
  res.json({ results: rows, total: rows.length });
});

// GET /api/series/:series_id_or_title/seasons
router.get('/:key/seasons', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const isNumeric = /^\d+$/.test(key);

  const episodes = isNumeric
    ? db.prepare('SELECT * FROM movies WHERE type="tv" AND series_id = ? ORDER BY COALESCE(season_number,1), COALESCE(episode_number,0), title').all(parseInt(key, 10))
    : db.prepare('SELECT * FROM movies WHERE type="tv" AND (series_title = ? OR title = ?) ORDER BY COALESCE(season_number,1), COALESCE(episode_number,0), title').all(key, key);

  if (!episodes.length) return res.status(404).json({ error: 'Series not found' });

  const seasons = {};
  episodes.forEach(ep => {
    const s = ep.season_number || 1;
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  });
  Object.values(seasons).forEach(eps => eps.sort((a, b) => (a.episode_number||0) - (b.episode_number||0) || String(a.title).localeCompare(String(b.title))));

  const first = episodes[0];
  res.json({
    series_id:     first.series_id,
    series_title:  first.series_title || first.title,
    series_poster: first.series_poster || first.poster_path,
    backdrop_path: first.backdrop_path,
    description:   first.description,
    genres:        first.genres,
    rating:        first.rating,
    year:          first.year,
    seasons,
    episode_count: episodes.length,
  });
});

module.exports = router;
