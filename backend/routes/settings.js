const express = require('express');
const router  = express.Router();
const { getSetting, setSetting, DEFAULTS } = require('../settings');
const { requireAdmin } = require('../middleware');

const ALLOWED_KEYS = ['tmdb_language'];

// GET /api/settings
router.get('/', requireAdmin, (req, res) => {
  const rows    = db.prepare('SELECT key, value FROM app_settings').all();
  const current = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ...DEFAULTS, ...current });
});

// POST /api/settings
router.post('/', requireAdmin, (req, res) => {
  const body  = req.body || {};
  const saved = [];
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      setSetting(key, body[key]);
      saved.push(key);
    }
  }
  res.json({ ok: true, saved });
});

module.exports = router;
