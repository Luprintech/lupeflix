const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';

async function tmdbGet(endpoint, params = {}, lang = 'es-ES') {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', lang);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  return r.json();
}

// GET /api/tmdb/search?q=...&type=movie|tv&year=...
router.get('/search', async (req, res) => {
  const { q, type = 'movie', year } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const endpoint = type === 'tv' ? '/search/tv' : '/search/movie';
    const params   = { query: q };
    if (year) params.year = year;

    // Search in es-ES
    let data = await tmdbGet(endpoint, params, 'es-ES');

    // If no results in Spanish, try English (title in filename might be original)
    if (!data.results?.length) {
      data = await tmdbGet(endpoint, params, 'en-US');
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/tmdb/detail/:type/:id
router.get('/detail/:type/:id', async (req, res) => {
  try {
    // Get es-ES first
    const es = await tmdbGet(`/${req.params.type}/${req.params.id}`, {}, 'es-ES');

    // Backfill empty overview with English
    if (!es.overview) {
      try {
        const en = await tmdbGet(`/${req.params.type}/${req.params.id}`, {}, 'en-US');
        es.overview = en.overview || '';
      } catch {}
    }

    res.json(es);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
