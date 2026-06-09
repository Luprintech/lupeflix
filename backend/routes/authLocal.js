const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { sendVerificationEmail, smtpConfigured } = require('../mailer');

function makeToken() { return crypto.randomBytes(32).toString('hex'); }

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf('=');
      if (idx === -1) return [part, ''];
      return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
    }));
}

function requestToken(req) {
  return req.headers['x-user-token'] || parseCookies(req).lupeflix_token || null;
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('lupeflix_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 180,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie('lupeflix_token', { path: '/' });
}

function publicUser(user) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    picture: user.picture,
    email_verified: user.email_verified,
  };
}

function createSession(req, res, email) {
  const token = makeToken();
  db.prepare('INSERT INTO sessions (token, user_email) VALUES (?,?)').run(token, email);
  setSessionCookie(req, res, token);
  return token;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!cleanName || !cleanEmail || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Contraseña muy corta' });

  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(cleanEmail);
  if (existing?.email_verified) return res.status(409).json({ error: 'Email ya registrado' });

  // If no SMTP is configured, create the account already verified — no email flow needed.
  if (!smtpConfigured()) {
    if (existing) {
      db.prepare(`
        UPDATE users
        SET name = ?, password = ?, email_verified = 1, verification_token = NULL
        WHERE email = ?
      `).run(cleanName, password, cleanEmail);
    } else {
      db.prepare(`
        INSERT INTO users (name, email, password, role, email_verified)
        VALUES (?,?,?,?,1)
      `).run(cleanName, cleanEmail, password, 'user');
    }
    const token = createSession(req, res, cleanEmail);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    return res.json({ ok: true, verification_required: false, token, user: publicUser(user) });
  }

  // SMTP is configured — use email verification flow.
  const verificationToken = makeToken();
  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, password = ?, verification_token = ?, verification_sent_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `).run(cleanName, password, verificationToken, cleanEmail);
  } else {
    db.prepare(`
      INSERT INTO users (name, email, password, role, email_verified, verification_token, verification_sent_at)
      VALUES (?,?,?,?,0,?, CURRENT_TIMESTAMP)
    `).run(cleanName, cleanEmail, password, 'user', verificationToken);
  }

  const mail = await sendVerificationEmail({ req, email: cleanEmail, name: cleanName, token: verificationToken });
  res.json({ ok: true, verification_required: true, email_sent: mail.sent });
});

// GET /api/auth/verify-email?token=...
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token requerido');
  const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
  if (!user) return res.redirect('/login?verified=invalid');

  db.prepare(`
    UPDATE users
    SET email_verified = 1, verification_token = NULL
    WHERE email = ?
  `).run(user.email);

  res.redirect('/login?verified=1');
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
  if (user.email_verified === 0) return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión' });

  const token = createSession(req, res, email);
  res.json({ ok: true, token, user: publicUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = requestToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = requestToken(req);
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Invalid token' });
  }
  const user = db.prepare('SELECT id, name, email, role, created_at, email_verified FROM users WHERE email = ?').get(session.user_email);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ token, user: publicUser(user) });
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  const token = requestToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Sesión inválida' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(session.user_email);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

  if (String(user.password || '').startsWith('google:')) {
    return res.status(400).json({ error: 'Las cuentas de Google no tienen contraseña en LupeFlix' });
  }

  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Faltan campos' });
  if (String(new_password).length < 6) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres' });
  if (user.password !== current_password) return res.status(403).json({ error: 'La contraseña actual no es correcta' });

  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(new_password, user.email);
  res.json({ ok: true });
});

// DELETE /api/auth/account
router.delete('/account', (req, res) => {
  const token = requestToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Sesión inválida' });

  const email = session.user_email;
  db.prepare('DELETE FROM sessions WHERE user_email = ?').run(email);
  db.prepare('DELETE FROM users WHERE email = ?').run(email);
  clearSessionCookie(res);
  res.json({ ok: true });
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
    const cleanEmail = String(email || '').toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      db.prepare('INSERT INTO users (name, email, password, role, email_verified) VALUES (?,?,?,?,1)').run(
        name || cleanEmail.split('@')[0], cleanEmail, `google:${info.sub}`, 'user'
      );
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    } else if (user.email_verified === 0) {
      db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE email = ?').run(cleanEmail);
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    }

    const token = createSession(req, res, cleanEmail);
    res.json({ ok: true, token, user: publicUser({ ...user, picture }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
