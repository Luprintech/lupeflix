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
