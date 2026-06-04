const db = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const DEFAULTS = {
  tmdb_language: 'es-ES',
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? DEFAULTS[key];
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value));
}

function getLang() {
  return getSetting('tmdb_language');
}

function getImgLang() {
  return getLang().split('-')[0]; // 'es-ES' → 'es'
}

module.exports = { getSetting, setSetting, getLang, getImgLang, DEFAULTS };
