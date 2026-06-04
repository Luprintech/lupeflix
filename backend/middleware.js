const db = require('./db');

function cookieToken(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf('=');
      return idx === -1 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
    }));
  return cookies.lupeflix_token;
}

/**
 * Shared admin middleware for all routes.
 *
 * Accepts in order:
 *  1. x-admin-token header matching ADMIN_TOKEN env var
 *  2. x-user-token header whose session email matches ADMIN_EMAIL env var
 *     (if ADMIN_EMAIL is not set, any valid session token is accepted)
 */
function requireAdmin(req, res, next) {
  // 1. Admin panel static token
  if (
    process.env.ADMIN_TOKEN &&
    req.headers['x-admin-token'] === process.env.ADMIN_TOKEN
  ) return next();

  // 2. User session token (main app admin users)
  const token = req.headers['x-user-token'] || cookieToken(req);
  if (token) {
    if (!process.env.ADMIN_EMAIL) return next(); // no email restriction — any session passes
    const session = db.prepare('SELECT user_email FROM sessions WHERE token = ?').get(token);
    if (session?.user_email === process.env.ADMIN_EMAIL) return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { requireAdmin };
