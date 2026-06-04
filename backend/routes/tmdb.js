const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

const TMDB_KEY = process.env.TMDB_API_KEY || '2dca580c2a14b55200e784d157207b4d';
const BASE     = 'https://api.themoviedb.org/3';

function providerSummary(providers) {
  const es = providers?.results?.ES || null;
  if (!es) return { region: 'ES', link: null, flatrate: [], rent: [], buy: [] };
  const map = arr => (arr || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
  return { region: 'ES', link: es.link || null, flatrate: map(es.flatrate), rent: map(es.rent), buy: map(es.buy) };
}

async function tmdbGet(endpoint, params = {}, lang = 'es-ES') {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  if (lang) url.searchParams.set('language', lang);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  return r.json();
}

function uniqByMediaAndId(items) {
  const seen = new Set();
  return items.filter(item => {
    const mediaType = item.media_type || (item.name ? 'tv' : 'movie');
    if (!['movie', 'tv'].includes(mediaType)) return false;
    const key = `${mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    item.media_type = mediaType;
    return true;
  });
}

function documentaryQueryVariants(q) {
  const clean = String(q || '').trim();
  const lower = clean.toLowerCase();
  const variants = new Set([clean]);

  // Common Spanish file titles for nature docs often have no official Spanish
  // alias in TMDB search, but the original English title exists.
  if (/salvar\s+(al|el)\s+planeta\s+tierra/.test(lower)) variants.add('Saving Planet Earth');
  if (/nuestro\s+planeta/.test(lower)) variants.add('Our Planet');
  if (/vida\s+en\s+nuestro\s+planeta/.test(lower)) variants.add('Life on Our Planet');
  if (/limites?\s+de\s+nuestro\s+planeta/.test(lower)) variants.add('Breaking Boundaries: The Science of Our Planet');

  return [...variants].filter(Boolean);
}

function rankDocumentaries(items) {
  return uniqByMediaAndId(items)
    .map(item => {
      const genres = item.genre_ids || [];
      const isDoc = genres.includes(99);
      const isFamily = genres.includes(10751);
      const isNews = genres.includes(10763);
      const isFiction = genres.some(g => [28, 35, 80, 878, 14, 27].includes(g));
      return {
        ...item,
        _score: (isDoc ? 100 : 0) + (isFamily ? 6 : 0) + (isNews ? 3 : 0) - (isFiction ? 40 : 0) + Number(item.vote_count || 0) / 1000,
      };
    })
    .sort((a, b) => b._score - a._score)
    .filter(item => item._score > 0);
}

async function searchDocumentary(q, year) {
  const collected = [];
  for (const query of documentaryQueryVariants(q)) {
    for (const lang of ['es-ES', 'en-US']) {
      const params = { query };
      if (year) {
        params.year = year;
        params.first_air_date_year = year;
      }
      const data = await tmdbGet('/search/multi', params, lang);
      collected.push(...(data.results || []));
    }
  }
  const results = rankDocumentaries(collected).slice(0, 20);
  return { page: 1, results, total_pages: results.length ? 1 : 0, total_results: results.length };
}

// GET /api/tmdb/search?q=...&type=movie|tv|documentary&year=...
router.get('/search', async (req, res) => {
  const { q, type = 'movie', year } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    if (type === 'documentary') {
      return res.json(await searchDocumentary(q, year));
    }

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
    const type = req.params.type === 'tv' ? 'tv' : 'movie';
    const id = req.params.id;

    // Get es-ES first
    const [es, providers] = await Promise.all([
      tmdbGet(`/${type}/${id}`, {}, 'es-ES'),
      tmdbGet(`/${type}/${id}/watch/providers`, {}, ''),
    ]);

    // Backfill empty overview with English
    if (!es.overview) {
      try {
        const en = await tmdbGet(`/${type}/${id}`, {}, 'en-US');
        es.overview = en.overview || '';
      } catch {}
    }

    res.json({ ...es, providers: providerSummary(providers) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
