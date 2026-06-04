const express = require('express');
const router = express.Router();
const db = require('../db');

// ── AUTH MIDDLEWARE ──
function requireUser(req, res, next) {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = db.prepare('SELECT user_email FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  req.userEmail = session.user_email;
  next();
}

// ── FAVORITES & WATCHLIST ──

// GET /api/user/favorites?list_type=favorite|watchlist
router.get('/favorites', requireUser, (req, res) => {
  const { list_type = 'favorite' } = req.query;
  const rows = db.prepare(`
    SELECT m.*, f.added_at as saved_at FROM favorites f
    JOIN movies m ON m.id = f.movie_id
    WHERE f.user_email = ? AND f.list_type = ?
    ORDER BY f.added_at DESC
  `).all(req.userEmail, list_type);
  res.json(rows);
});

// POST /api/user/favorites
router.post('/favorites', requireUser, (req, res) => {
  const { movie_id, list_type = 'favorite' } = req.body;
  if (!movie_id) return res.status(400).json({ error: 'movie_id required' });
  try {
    db.prepare('INSERT INTO favorites (user_email, movie_id, list_type) VALUES (?,?,?)').run(req.userEmail, movie_id, list_type);
    res.json({ ok: true, added: true });
  } catch {
    res.json({ ok: true, added: false, reason: 'already_exists' });
  }
});

// DELETE /api/user/favorites/:movie_id
router.delete('/favorites/:movie_id', requireUser, (req, res) => {
  const { list_type = 'favorite' } = req.query;
  db.prepare('DELETE FROM favorites WHERE user_email = ? AND movie_id = ? AND list_type = ?').run(req.userEmail, req.params.movie_id, list_type);
  res.json({ ok: true });
});

// GET /api/user/favorites/check/:movie_id
router.get('/favorites/check/:movie_id', requireUser, (req, res) => {
  const fav  = db.prepare('SELECT id FROM favorites WHERE user_email = ? AND movie_id = ? AND list_type = ?').get(req.userEmail, req.params.movie_id, 'favorite');
  const later = db.prepare('SELECT id FROM favorites WHERE user_email = ? AND movie_id = ? AND list_type = ?').get(req.userEmail, req.params.movie_id, 'watchlist');
  res.json({ is_favorite: !!fav, in_watchlist: !!later });
});

// ── EXTERNAL WATCHLIST (TMDB items not in local server) ──

router.get('/external-watchlist', requireUser, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM external_watchlist
    WHERE user_email = ?
    ORDER BY added_at DESC
  `).all(req.userEmail).map(row => ({
    ...row,
    providers: row.providers_json ? JSON.parse(row.providers_json) : null,
  }));
  res.json(rows);
});

router.post('/external-watchlist', requireUser, (req, res) => {
  const { tmdb_id, media_type, title, year, poster_path, rating, providers } = req.body || {};
  if (!tmdb_id || !media_type || !title) {
    return res.status(400).json({ error: 'tmdb_id, media_type and title required' });
  }
  db.prepare(`
    INSERT INTO external_watchlist
      (user_email, tmdb_id, media_type, title, year, poster_path, rating, providers_json)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(user_email, tmdb_id, media_type) DO UPDATE SET
      title=excluded.title,
      year=excluded.year,
      poster_path=excluded.poster_path,
      rating=excluded.rating,
      providers_json=excluded.providers_json,
      added_at=CURRENT_TIMESTAMP
  `).run(
    req.userEmail,
    Number(tmdb_id),
    media_type,
    title,
    year || null,
    poster_path || null,
    rating || null,
    providers ? JSON.stringify(providers) : null
  );
  res.json({ ok: true, added: true });
});

router.delete('/external-watchlist/:media_type/:tmdb_id', requireUser, (req, res) => {
  db.prepare(`
    DELETE FROM external_watchlist
    WHERE user_email = ? AND media_type = ? AND tmdb_id = ?
  `).run(req.userEmail, req.params.media_type, req.params.tmdb_id);
  res.json({ ok: true });
});

// ── WATCH HISTORY ──

// GET /api/user/history
router.get('/history', requireUser, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, h.progress, h.duration as h_duration, h.completed, h.watched_at FROM watch_history h
    JOIN movies m ON m.id = h.movie_id
    WHERE h.user_email = ?
    ORDER BY h.watched_at DESC
    LIMIT 50
  `).all(req.userEmail);
  res.json(rows);
});

// POST /api/user/history — update progress
router.post('/history', requireUser, (req, res) => {
  const { movie_id, progress = 0, duration = 0 } = req.body;
  if (!movie_id) return res.status(400).json({ error: 'movie_id required' });
  const completed = duration > 0 && progress / duration > 0.9 ? 1 : 0;
  const existing = db.prepare('SELECT id FROM watch_history WHERE user_email = ? AND movie_id = ?').get(req.userEmail, movie_id);
  db.prepare(`
    INSERT INTO watch_history (user_email, movie_id, progress, duration, completed, watched_at)
    VALUES (?,?,?,?,?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_email, movie_id) DO UPDATE SET
      progress=excluded.progress, duration=excluded.duration,
      completed=excluded.completed, watched_at=CURRENT_TIMESTAMP
  `).run(req.userEmail, movie_id, progress, duration, completed);

  // Count one view when the user starts tracking this title, not on every progress heartbeat.
  if (!existing) db.prepare('UPDATE movies SET views = views + 1 WHERE id = ?').run(movie_id);
  res.json({ ok: true });
});

// DELETE /api/user/history/:movie_id
router.delete('/history/:movie_id', requireUser, (req, res) => {
  db.prepare('DELETE FROM watch_history WHERE user_email = ? AND movie_id = ?').run(req.userEmail, req.params.movie_id);
  res.json({ ok: true });
});

// ── RECOMMENDATIONS (content-based filtering) ──

const MOVIE_STRICT = `type = 'movie' AND (season_number IS NULL OR season_number < 1) AND (series_title IS NULL OR series_title = '') AND (episode_number IS NULL OR episode_number < 1)`;

function dedupeItems(items, n) {
  const seen = new Set();
  const out  = [];
  for (const m of items) {
    const key = m.tmdb_id ? `id:${m.tmdb_id}` : `t:${String(m.title || '').toLowerCase().slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= n) break;
  }
  return out;
}

// Convert individual TV episodes into series-level cards so recommendations
// don't show "Breaking Bad — S03E07" but rather the full series card.
function groupTvAsSeriesCards(items) {
  const seriesMap = new Map();
  const result    = [];
  for (const m of items) {
    if (m.type !== 'tv') { result.push(m); continue; }
    const key = m.series_id
      ? `sid:${m.series_id}`
      : `st:${(m.series_title || m.title || '').toLowerCase().slice(0, 80)}`;
    if (!seriesMap.has(key)) {
      const card = {
        ...m,
        title:        m.series_title || m.title,
        series_title: m.series_title || m.title,
        poster_path:  m.series_poster || m.poster_path,
        series_poster: m.series_poster || m.poster_path,
        is_series:    1,
        episode_count: 1,
        series_key:   key,
      };
      seriesMap.set(key, card);
      result.push(card);
    } else {
      seriesMap.get(key).episode_count += 1;
    }
  }
  return result;
}

// GET /api/user/recommendations?type=movie|tv|documentary&limit=24
router.get('/recommendations', requireUser, (req, res) => {
  const { type, limit = 24 } = req.query;
  const n = Number(limit);

  const watched = db.prepare(`
    SELECT m.id, m.genres, m.director
    FROM watch_history h JOIN movies m ON m.id = h.movie_id
    WHERE h.user_email = ? AND (h.completed = 1 OR h.progress > 60)
    ORDER BY h.watched_at DESC LIMIT 40
  `).all(req.userEmail);

  const watchedIds = watched.map(w => w.id);
  const genreFreq = {}, dirFreq = {};
  for (const w of watched) {
    (w.genres || '').split(',').forEach(g => { const k = g.trim(); if (k) genreFreq[k] = (genreFreq[k] || 0) + 1; });
    (w.director || '').split(',').forEach(d => { const k = d.trim(); if (k) dirFreq[k] = (dirFreq[k] || 0) + 1; });
  }

  const buildBase = (orderBy = 'ORDER BY rating DESC, views DESC') => {
    let q = 'SELECT * FROM movies WHERE 1=1';
    const p = [];
    if (watchedIds.length) { q += ` AND id NOT IN (${watchedIds.map(() => '?').join(',')})`, p.push(...watchedIds); }
    if (type === 'movie') { q += ` AND ${MOVIE_STRICT}`; }
    else if (type) { q += ' AND type = ?'; p.push(type); }
    q += ` ${orderBy} LIMIT 1000`;
    return db.prepare(q).all(...p);
  };

  if (!watchedIds.length || !Object.keys(genreFreq).length) {
    const fallback = groupTvAsSeriesCards(dedupeItems(buildBase(), n * 3));
    return res.json(dedupeItems(fallback, n));
  }

  const candidates = buildBase('ORDER BY added_at DESC');
  const scored = candidates
    .filter(m => (m.genres || '').split(',').some(g => genreFreq[g.trim()]))
    .map(m => {
      let s = 0;
      (m.genres   || '').split(',').forEach(g => { const f = genreFreq[g.trim()]; if (f) s += f * 10; });
      (m.director || '').split(',').forEach(d => { const f = dirFreq[d.trim()];   if (f) s += f * 5; });
      s += (m.rating || 0) * 2;
      s += Math.log1p(m.views || 0);
      return { ...m, _score: s };
    })
    .sort((a, b) => b._score - a._score);

  // Group TV episodes into series cards, then deduplicate
  const grouped = groupTvAsSeriesCards(dedupeItems(scored, n * 5));
  res.json(dedupeItems(grouped, n));
});

// GET /api/user/because-watched?type=...&limit=24
router.get('/because-watched', requireUser, (req, res) => {
  const { type, limit = 24 } = req.query;

  let q = `SELECT m.id, m.title, m.series_title, m.genres
    FROM watch_history h JOIN movies m ON m.id = h.movie_id
    WHERE h.user_email = ?`;
  const p = [req.userEmail];
  if (type) { q += ' AND m.type = ?'; p.push(type); }
  q += ' ORDER BY h.watched_at DESC LIMIT 1';

  const last = db.prepare(q).get(...p);
  if (!last) return res.json({ title: null, items: [] });

  const genres = (last.genres || '').split(',').map(g => g.trim()).filter(Boolean);
  if (!genres.length) return res.json({ title: null, items: [] });

  const allWatched = db.prepare('SELECT movie_id FROM watch_history WHERE user_email = ?')
    .all(req.userEmail).map(r => r.movie_id);
  const exclude = [...new Set([last.id, ...allWatched])];
  const excPh   = exclude.map(() => '?').join(',');

  let cq = `SELECT * FROM movies WHERE id NOT IN (${excPh})`;
  const cp = [...exclude];
  if (type) { cq += ' AND type = ?'; cp.push(type); }
  cq += ' ORDER BY rating DESC, views DESC LIMIT 300';

  const raw_items = db.prepare(cq).all(...cp)
    .filter(m => (m.genres || '').split(',').some(g => genres.includes(g.trim())));

  const grouped = groupTvAsSeriesCards(dedupeItems(raw_items, Number(limit) * 3));
  const items   = dedupeItems(grouped, Number(limit));

  const raw   = last.series_title || last.title || '';
  const title = raw.length > 45 ? raw.slice(0, 45) + '…' : raw;
  res.json({ title, items });
});

// ── SETTINGS ──

router.get('/settings', requireUser, (req, res) => {
  let s = db.prepare('SELECT * FROM user_settings WHERE user_email = ?').get(req.userEmail);
  if (!s) {
    const user = db.prepare('SELECT name FROM users WHERE email = ?').get(req.userEmail);
    s = { user_email: req.userEmail, display_name: user?.name, avatar_color: '#e50914', language: 'es', autoplay: 1 };
  }
  res.json(s);
});

router.put('/settings', requireUser, (req, res) => {
  const { display_name, avatar_color, language, autoplay } = req.body;
  db.prepare(`
    INSERT INTO user_settings (user_email, display_name, avatar_color, language, autoplay, updated_at)
    VALUES (?,?,?,?,?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_email) DO UPDATE SET
      display_name=excluded.display_name, avatar_color=excluded.avatar_color,
      language=excluded.language, autoplay=excluded.autoplay, updated_at=CURRENT_TIMESTAMP
  `).run(req.userEmail, display_name, avatar_color, language, autoplay ? 1 : 0);

  if (display_name) db.prepare('UPDATE users SET name=? WHERE email=?').run(display_name, req.userEmail);
  res.json({ ok: true });
});

module.exports = router;
