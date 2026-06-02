const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db');

// POST /api/auth/google
// Verifies Google Identity Services credential (JWT) and returns user session data
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential required' });

  try {
    // Verify token with Google
    const info = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    ).then(r => r.json());

    if (info.error) return res.status(401).json({ error: 'Invalid Google token' });

    // Verify audience matches our client ID (if configured)
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && info.aud !== clientId) {
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    const { email, name, picture, sub: googleId } = info;

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
      ).run(name || email.split('@')[0], email, `google:${googleId}`, 'user');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else if (!user.password.startsWith('google:')) {
      // Update existing user with google link
      db.prepare('UPDATE users SET name = ? WHERE email = ?').run(name || user.name, email);
      user.name = name || user.name;
    }

    res.json({
      ok: true,
      user: { name: user.name, email: user.email, picture }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/config — returns OAuth config for frontend
router.get('/config', (req, res) => {
  res.json({
    google_client_id: process.env.GOOGLE_CLIENT_ID || null,
  });
});

module.exports = router;
