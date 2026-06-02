const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'lupeflix.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    original_title TEXT,
    year          INTEGER,
    description   TEXT,
    genres        TEXT,
    director      TEXT,
    cast          TEXT,
    rating        REAL,
    duration      INTEGER,
    type          TEXT DEFAULT 'movie',
    poster_path   TEXT,
    backdrop_path TEXT,
    tmdb_id       INTEGER,
    file_path     TEXT,
    file_size     INTEGER,
    added_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    views         INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT DEFAULT 'user',
    avatar_color TEXT DEFAULT '#e50914',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    movie_id   INTEGER NOT NULL,
    list_type  TEXT DEFAULT 'favorite',
    added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, movie_id, list_type)
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    movie_id   INTEGER NOT NULL,
    progress   INTEGER DEFAULT 0,
    duration   INTEGER DEFAULT 0,
    completed  INTEGER DEFAULT 0,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, movie_id)
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_email    TEXT PRIMARY KEY,
    display_name  TEXT,
    avatar_color  TEXT DEFAULT '#e50914',
    language      TEXT DEFAULT 'es',
    autoplay      INTEGER DEFAULT 1,
    mature_content INTEGER DEFAULT 0,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations - add columns if they don't exist yet.
// Keep this after CREATE TABLE so a fresh database can bootstrap cleanly.
const existingCols = db.prepare('PRAGMA table_info(movies)').all().map(c => c.name);
const migrations = [
  { col: 'season_number',    sql: 'ALTER TABLE movies ADD COLUMN season_number INTEGER' },
  { col: 'episode_number',   sql: 'ALTER TABLE movies ADD COLUMN episode_number INTEGER' },
  { col: 'episode_title',    sql: 'ALTER TABLE movies ADD COLUMN episode_title TEXT' },
  { col: 'episode_air_date', sql: 'ALTER TABLE movies ADD COLUMN episode_air_date TEXT' },
  { col: 'series_id',        sql: 'ALTER TABLE movies ADD COLUMN series_id INTEGER' },
  { col: 'series_title',     sql: 'ALTER TABLE movies ADD COLUMN series_title TEXT' },
  { col: 'series_poster',    sql: 'ALTER TABLE movies ADD COLUMN series_poster TEXT' },
];
migrations.forEach(m => { if (!existingCols.includes(m.col)) db.exec(m.sql); });

module.exports = db;
