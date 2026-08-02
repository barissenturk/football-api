import express from "express";
import cors from "cors";
import { openDb, initSchema, dbPath } from "./db.js";

const PORT = Number(process.env.PORT) || 3000;

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const db = openDb();
initSchema(db);

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
  })
);
app.use(express.json());

function teamLabel(row) {
  return {
    id: row.id,
    name: row.name_tr || row.name_en,
    nameEn: row.name_en,
    nameTr: row.name_tr,
    country: row.country,
    league: row.league,
    logoUrl: row.logo_url || null,
    seeded: Boolean(row.seeded),
  };
}

app.get("/", (_req, res) => {
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM teams) AS teams,
        (SELECT COUNT(*) FROM players) AS players,
        (SELECT COUNT(*) FROM stints) AS stints`
    )
    .get();
  const lastSync = db
    .prepare(`SELECT value FROM sync_meta WHERE key = 'last_sync'`)
    .get()?.value;

  res.json({
    name: "Football Common Players API",
    database: dbPath,
    counts,
    lastSync: lastSync || null,
    endpoints: {
      "GET /health": "Health check",
      "GET /teams?q=&league=&limit=": "Takım ara",
      "GET /teams/:id": "Takım detay",
      "GET /teams/:id/players": "Takımda oynamış oyuncular",
      "GET /common-players?team1=&team2=": "İki takımda da oynamış oyuncular",
      "GET /players/:id": "Oyuncu kariyeri",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/teams", (req, res) => {
  const q = String(req.query.q || "").trim();
  const league = String(req.query.league || "").trim();
  const seededOnly = String(req.query.seeded || "") === "1";
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const clauses = [];
  const params = {};

  if (q) {
    clauses.push(
      `(name_en LIKE @q OR IFNULL(name_tr, '') LIKE @q OR id LIKE @q)`
    );
    params.q = `%${q}%`;
  }
  if (league) {
    clauses.push(`IFNULL(league, '') LIKE @league`);
    params.league = `%${league}%`;
  }
  if (seededOnly) {
    clauses.push(`seeded = 1`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
      SELECT id, name_en, name_tr, country, league, logo_url, seeded
      FROM teams
      ${where}
      ORDER BY seeded DESC, name_en ASC
      LIMIT @limit
    `
    )
    .all({ ...params, limit });

  res.json({ count: rows.length, teams: rows.map(teamLabel) });
});

app.get("/teams/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, name_en, name_tr, country, league, logo_url, seeded FROM teams WHERE id = ?`
    )
    .get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: "Takım bulunamadı" });
  }

  const playerCount = db
    .prepare(`SELECT COUNT(DISTINCT player_id) AS c FROM stints WHERE team_id = ?`)
    .get(req.params.id).c;

  res.json({ ...teamLabel(row), playerCount });
});

app.get("/teams/:id/players", (req, res) => {
  const team = db.prepare(`SELECT id FROM teams WHERE id = ?`).get(req.params.id);
  if (!team) {
    return res.status(404).json({ error: "Takım bulunamadı" });
  }

  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.name_tr,
        p.birth_date,
        p.image_url,
        MIN(s.start_date) AS first_start,
        MAX(s.end_date) AS last_end
      FROM stints s
      JOIN players p ON p.id = s.player_id
      WHERE s.team_id = @teamId
      GROUP BY p.id
      ORDER BY p.name ASC
      LIMIT @limit
    `
    )
    .all({ teamId: req.params.id, limit });

  res.json({
    teamId: req.params.id,
    count: rows.length,
    players: rows.map((r) => ({
      id: r.id,
      name: r.name_tr || r.name,
      nameEn: r.name,
      birthYear: r.birth_date,
      imageUrl: r.image_url,
      startYear: r.first_start,
      endYear: r.last_end,
    })),
  });
});

/**
 * Core endpoint: players who have stints at both team1 and team2.
 * Accepts Wikidata Q-ids or case-insensitive team names.
 */
function resolveTeam(input) {
  const value = String(input || "").trim();
  if (!value) return null;

  if (/^Q\d+$/i.test(value)) {
    return db
      .prepare(
        `SELECT id, name_en, name_tr, country, league, logo_url, seeded FROM teams WHERE id = ?`
      )
      .get(value.toUpperCase());
  }

  const exact = db
    .prepare(
      `
      SELECT t.id, t.name_en, t.name_tr, t.country, t.league, t.logo_url, t.seeded,
             (SELECT COUNT(DISTINCT player_id) FROM stints s WHERE s.team_id = t.id) AS player_count
      FROM teams t
      WHERE lower(t.name_en) = lower(@v)
         OR lower(IFNULL(t.name_tr, '')) = lower(@v)
      ORDER BY player_count DESC, t.seeded DESC
      LIMIT 1
    `
    )
    .get({ v: value });

  if (exact) return exact;

  return db
    .prepare(
      `
      SELECT t.id, t.name_en, t.name_tr, t.country, t.league, t.logo_url, t.seeded,
             (SELECT COUNT(DISTINCT player_id) FROM stints s WHERE s.team_id = t.id) AS player_count
      FROM teams t
      WHERE t.name_en LIKE @q OR IFNULL(t.name_tr, '') LIKE @q
      ORDER BY player_count DESC, t.seeded DESC, length(t.name_en) ASC
      LIMIT 1
    `
    )
    .get({ q: `%${value}%` });
}

app.get("/common-players", (req, res) => {
  const t1 = resolveTeam(req.query.team1);
  const t2 = resolveTeam(req.query.team2);

  if (!t1 || !t2) {
    return res.status(400).json({
      error: "team1 ve team2 gerekli (Wikidata id veya takım adı)",
      example: "/common-players?team1=Galatasaray&team2=Q18656",
    });
  }

  if (t1.id === t2.id) {
    return res.status(400).json({ error: "İki farklı takım seçin" });
  }

  const detailed = db
    .prepare(
      `
      SELECT
        p.id AS player_id,
        p.name,
        p.name_tr,
        p.birth_date,
        p.image_url,
        s.team_id,
        MIN(s.start_date) AS start_date,
        MAX(s.end_date) AS end_date
      FROM players p
      JOIN stints s ON s.player_id = p.id
      WHERE p.id IN (
        SELECT s1.player_id
        FROM stints s1
        JOIN stints s2 ON s2.player_id = s1.player_id
        WHERE s1.team_id = @team1 AND s2.team_id = @team2
      )
        AND s.team_id IN (@team1, @team2)
      GROUP BY p.id, s.team_id
      ORDER BY p.name ASC
    `
    )
    .all({ team1: t1.id, team2: t2.id });

  const playersMap = new Map();
  for (const row of detailed) {
    if (!playersMap.has(row.player_id)) {
      playersMap.set(row.player_id, {
        id: row.player_id,
        name: row.name_tr || row.name,
        nameEn: row.name,
        birthYear: row.birth_date,
        imageUrl: row.image_url,
        stints: {},
      });
    }
    const player = playersMap.get(row.player_id);
    const key = row.team_id === t1.id ? "team1" : "team2";
    player.stints[key] = {
      teamId: row.team_id,
      startYear: row.start_date,
      endYear: row.end_date,
    };
  }

  const players = [...playersMap.values()];

  res.json({
    team1: teamLabel(t1),
    team2: teamLabel(t2),
    count: players.length,
    players,
  });
});

app.get("/players/:id", (req, res) => {
  const player = db
    .prepare(
      `SELECT id, name, name_tr, birth_date, nationality, image_url FROM players WHERE id = ?`
    )
    .get(req.params.id);

  if (!player) {
    return res.status(404).json({ error: "Oyuncu bulunamadı" });
  }

  const career = db
    .prepare(
      `
      SELECT
        t.id AS team_id,
        t.name_en,
        t.name_tr,
        t.country,
        t.league,
        t.logo_url,
        MIN(s.start_date) AS start_date,
        MAX(s.end_date) AS end_date
      FROM stints s
      JOIN teams t ON t.id = s.team_id
      WHERE s.player_id = ?
      GROUP BY t.id
      ORDER BY COALESCE(MIN(s.start_date), '9999') ASC, t.name_en ASC
    `
    )
    .all(req.params.id);

  res.json({
    id: player.id,
    name: player.name_tr || player.name,
    nameEn: player.name,
    birthYear: player.birth_date,
    imageUrl: player.image_url,
    career: career.map((c) => ({
      teamId: c.team_id,
      name: c.name_tr || c.name_en,
      nameEn: c.name_en,
      country: c.country,
      league: c.league,
      logoUrl: c.logo_url || null,
      startYear: c.start_date,
      endYear: c.end_date,
    })),
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası" });
});

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
  console.log(`DB  ${dbPath}`);
});
