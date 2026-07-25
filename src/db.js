const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS influencers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    platform TEXT NOT NULL DEFAULT 'instagram',
    category TEXT,
    profile_url TEXT,
    follower_count INTEGER NOT NULL DEFAULT 0,
    avg_likes REAL NOT NULL DEFAULT 0,
    avg_comments REAL NOT NULL DEFAULT 0,
    posts_sampled INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
