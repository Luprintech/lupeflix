/**
 * OMDb proxy — IMDb data as secondary metadata source
 * Free API key: omdbapi.com (1000 req/day)
 */
const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

const OMDB_KEY = process.env.OMDB_API_KEY || '';
const BASE     = 'https://www.omdbapi.com';

async function omdb(params = {}) {
  if (!OMDB_KEY) throw new Error('OMDB_API_KEY not configured');
  const url = new URL(BASE);
  url.searchParams.set('apikey', OMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  const data = await r.json();
  if (data.Response === 'False') throw new Error(data.Error || 'OMDb: no results');
  return data;
}

// GET /api/omdb/search?q=title&type=movie|series&year=2023
router.get('/search', async (req, res) => {
  const { q, type, year } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const params = { s: q };
    if (type)  params.type = type === 'tv' ? 'series' : type;
    if (year)  params.y    = year;
    const data = await omdb(params);
    res.json({ results: data.Search || [], total: parseInt(data.totalResults) || 0, source: 'omdb' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/omdb/id/:imdb_id  — full detail by IMDb ID
router.get('/id/:imdb_id', async (req, res) => {
  try {
    const data = await omdb({ i: req.params.imdb_id, plot: 'full' });
    res.json(normalizeOmdb(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/omdb/title?q=...&year=...&type=...
router.get('/title', async (req, res) => {
  const { q, year, type } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const params = { t: q, plot: 'full' };
    if (year) params.y    = year;
    if (type) params.type = type === 'tv' ? 'series' : type;
    const data = await omdb(params);
    res.json(normalizeOmdb(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function normalizeOmdb(d) {
  return {
    source:        'omdb',
    imdb_id:       d.imdbID,
    title:         d.Title,
    original_title: d.Title,
    year:          parseInt(d.Year) || null,
    description:   d.Plot !== 'N/A' ? d.Plot : '',
    genres:        d.Genre !== 'N/A' ? d.Genre : '',
    director:      d.Director !== 'N/A' ? d.Director : '',
    cast:          d.Actors !== 'N/A' ? d.Actors : '',
    rating:        d.imdbRating !== 'N/A' ? parseFloat(d.imdbRating) : null,
    duration:      d.Runtime !== 'N/A' ? parseInt(d.Runtime) : null,
    poster_path:   d.Poster !== 'N/A' ? d.Poster : null, // full URL, not TMDB path
    type:          d.Type === 'series' ? 'tv' : 'movie',
  };
}

module.exports = { router, omdb, normalizeOmdb };
