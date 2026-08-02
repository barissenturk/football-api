import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.join(__dirname, "..", "data");

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(defaultDataDir, "football.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export function openDb(readonly = false) {
  const db = new Database(dbPath, { readonly });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_tr TEXT,
      country TEXT,
      league TEXT,
      logo_url TEXT,
      seeded INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_tr TEXT,
      birth_date TEXT,
      nationality TEXT,
      image_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      start_date TEXT,
      end_date TEXT,
      UNIQUE(player_id, team_id, start_date, end_date)
    );

    CREATE INDEX IF NOT EXISTS idx_stints_team ON stints(team_id);
    CREATE INDEX IF NOT EXISTS idx_stints_player ON stints(player_id);
    CREATE INDEX IF NOT EXISTS idx_teams_name_en ON teams(name_en);
    CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export { dbPath };
