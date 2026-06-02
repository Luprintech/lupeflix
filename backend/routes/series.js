const express = require('express');
const router  = express.Router();
const db      = require('../db');
const path    = require('path');

function cleanSeriesName(value = '') {
  let name = String(value || '').replace(/\.[^.]+$/, '');
  name = name
    .replace(/[._-]+/g, ' ')
    .replace(/\b(?:season|temporada)\s*\d+\b.*$/i, '')
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b.*$/i, '')
    .replace(/\bS\d{1,2}\b.*$/i, '')
    .replace(/\b\d{1,2}x\d{1,3}\b.*$/i, '')
    .replace(/\b(?:720p|1080p|2160p|web[- ]?dl|webrip|bluray|x264|x265|h264|h265|hevc|aac|dts|dual|multi|spanish|castellano|latino)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name;
}

function seriesKeyFor(row) {
  if (row.series_id) return `id:${row.series_id}`;
  const fromSeries = cleanSeriesName(row.series_title);
  if (fromSeries) return `title:${fromSeries.toLowerCase()}`;

  // Prefer the folder immediately inside /media/Series or /media/SeriesAnimacion.
  const parts = String(row.file_path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const mediaIdx = parts.findIndex(p => p.toLowerCase() === 'media');
  if (mediaIdx >= 0) {
    const root = parts[mediaIdx + 1]?.toLowerCase() || '';
    if (root.includes('series') && parts[mediaIdx + 2]) return `title:${cleanSeriesName(parts[mediaIdx + 2]).toLowerCase()}`;
  }

  const title = cleanSeriesName(row.title);
  return `title:${(title || row.title || 'Serie sin t?tulo').toLowerCase()}`;
}

function seriesTitleFor(row) {
  const explicit = cleanSeriesName(row.series_title);
  if (explicit) return explicit;
  const parts = String(row.file_path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const mediaIdx = parts.findIndex(p => p.toLowerCase() === 'media');
  if (mediaIdx >= 0) {
    const root = parts[mediaIdx + 1]?.toLowerCase() || '';
    if (root.includes('series') && parts[mediaIdx + 2]) return cleanSeriesName(parts[mediaIdx + 2]);
  }
  return cleanSeriesName(row.title) || row.title || 'Serie sin t?tulo';
}

function normalizeEpisode(row) {
  return {
    ...row,
    series_key: seriesKeyFor(row),
    series_title: seriesTitleFor(row),
    series_poster: row.series_poster || row.poster_path,
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
        added_at: ep.added_at,
        views: ep.views || 0,
        type: 'tv',
        is_series: 1,
      });
    } else {
      existing.episode_count += 1;
      existing.views = Math.max(existing.views || 0, ep.views || 0);
      existing.rating = Math.max(existing.rating || 0, ep.rating || 0) || existing.rating;
      existing.poster_path = existing.poster_path || ep.series_poster || ep.poster_path;
      existing.series_poster = existing.series_poster || ep.series_poster || ep.poster_path;
      existing.backdrop_path = existing.backdrop_path || ep.backdrop_path;
      existing.description = existing.description || ep.description;
      existing.genres = existing.genres || ep.genres;
      existing.year = existing.year || ep.year;
      if (new Date(ep.added_at) > new Date(existing.added_at)) existing.added_at = ep.added_at;
    }
  }

  const results = [...map.values()]
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
    .slice(0, Number(limit));
  res.json({ results, total: results.length });
});

// GET /api/series/:series_key/seasons
router.get('/:key/seasons', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const episodes = db.prepare('SELECT * FROM movies WHERE type="tv" ORDER BY COALESCE(season_number,1), COALESCE(episode_number,0), title').all()
    .map(normalizeEpisode)
    .filter(ep => ep.series_key === key || String(ep.series_id || '') === key || ep.series_title === key);

  if (!episodes.length) return res.status(404).json({ error: 'Series not found', key });

  const seasons = {};
  episodes.forEach(ep => {
    const s = ep.season_number || 1;
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  });
  Object.values(seasons).forEach(eps => eps.sort((a, b) => (a.episode_number||0) - (b.episode_number||0) || String(a.title).localeCompare(String(b.title))));

  const first = episodes[0];
  res.json({
    series_key:    first.series_key,
    series_id:     first.series_id,
    series_title:  first.series_title,
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
