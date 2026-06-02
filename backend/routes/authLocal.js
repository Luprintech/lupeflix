const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

function makeToken() { return crypto.randomBytes(32).toString('hex'); }

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Email ya registrado' });

  db.prepare('INSERT INTO users (name, email, password) VALUES (?,?,?)').run(name, email, password);

  const token = makeToken();
  db.prepare('INSERT INTO sessions (token, user_email) VALUES (?,?)').run(token, email);

  res.json({ ok: true, token, user: { name, email } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = makeToken();
  db.prepare('INSERT INTO sessions (token, user_email) VALUES (?,?)').run(token, email);

  res.json({ ok: true, token, user: { name: user.name, email: user.email, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers['x-user-token'];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });
  const user = db.prepare('SELECT id, name, email, role, avatar_color, created_at FROM users WHERE email = ?').get(session.user_email);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user });
});

// GET /api/auth/config
router.get('/config', (req, res) => {
  res.json({ google_client_id: process.env.GOOGLE_CLIENT_ID || null });
});

// POST /api/auth/google (Google OAuth verify)
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential required' });
  try {
    const fetch = require('node-fetch');
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`).then(r => r.json());
    if (info.error) return res.status(401).json({ error: 'Invalid Google token' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && info.aud !== clientId) return res.status(401).json({ error: 'Token mismatch' });

    const { email, name, picture } = info;
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      db.prepare('INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)').run(
        name || email.split('@')[0], email, `google:${info.sub}`, 'user'
      );
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    const token = makeToken();
    db.prepare('INSERT INTO sessions (token, user_email) VALUES (?,?)').run(token, email);

    res.json({ ok: true, token, user: { name: user.name, email: user.email, picture, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
