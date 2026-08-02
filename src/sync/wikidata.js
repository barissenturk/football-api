import { SEED_CLUBS, QUICK_CLUBS } from "./clubs.js";
import { openDb, initSchema } from "../db.js";
import { sparql, sleep, chunk, qidFromUri } from "./sparql.js";
import { syncTeamLogos } from "./logos.js";

const PLAYER_BATCH = 40;

function yearOnly(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})/);
  return m ? m[1] : null;
}

function clubPlayersQuery(clubId) {
  return `
SELECT DISTINCT ?player ?playerLabel ?dob ?image WHERE {
  ?player wdt:P54 wd:${clubId} ;
          wdt:P106/wdt:P279* wd:Q937857 .
  OPTIONAL { ?player wdt:P569 ?dob }
  OPTIONAL { ?player wdt:P18 ?image }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim();
}

function careersQuery(playerIds) {
  const values = playerIds.map((id) => `wd:${id}`).join(" ");
  return `
SELECT ?player ?team ?teamLabel ?start ?end WHERE {
  VALUES ?player { ${values} }
  ?player p:P54 ?stmt .
  ?stmt ps:P54 ?team .
  OPTIONAL { ?stmt pq:P580 ?start }
  OPTIONAL { ?stmt pq:P582 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`.trim();
}

function upsertStatements(db) {
  const upsertTeam = db.prepare(`
    INSERT INTO teams (id, name_en, name_tr, country, league, seeded, updated_at)
    VALUES (@id, @name_en, @name_tr, @country, @league, @seeded, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name_en = COALESCE(excluded.name_en, teams.name_en),
      name_tr = COALESCE(excluded.name_tr, teams.name_tr),
      country = COALESCE(excluded.country, teams.country),
      league = COALESCE(excluded.league, teams.league),
      seeded = CASE WHEN excluded.seeded > teams.seeded THEN excluded.seeded ELSE teams.seeded END,
      updated_at = datetime('now')
  `);

  const upsertPlayer = db.prepare(`
    INSERT INTO players (id, name, name_tr, birth_date, image_url, updated_at)
    VALUES (@id, @name, @name_tr, @birth_date, @image_url, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_tr = COALESCE(excluded.name_tr, players.name_tr),
      birth_date = COALESCE(excluded.birth_date, players.birth_date),
      image_url = COALESCE(excluded.image_url, players.image_url),
      updated_at = datetime('now')
  `);

  const insertStint = db.prepare(`
    INSERT OR IGNORE INTO stints (player_id, team_id, start_date, end_date)
    VALUES (@player_id, @team_id, @start_date, @end_date)
  `);

  return { upsertTeam, upsertPlayer, insertStint };
}

async function syncClub(db, stmts, club, index, total) {
  process.stdout.write(`[${index + 1}/${total}] ${club.nameEn} (${club.id}) players... `);

  stmts.upsertTeam.run({
    id: club.id,
    name_en: club.nameEn,
    name_tr: club.nameTr,
    country: club.country,
    league: club.league,
    seeded: 1,
  });

  const playersJson = await sparql(clubPlayersQuery(club.id));
  const playerBindings = playersJson.results?.bindings || [];

  const players = [];
  for (const row of playerBindings) {
    const id = qidFromUri(row.player?.value);
    if (!id) continue;
    players.push({
      id,
      name: row.playerLabel?.value || id,
      name_tr: null,
      birth_date: yearOnly(row.dob?.value),
      image_url: row.image?.value || null,
    });
  }

  console.log(`${players.length} found`);

  const upsertPlayersTx = db.transaction((list) => {
    for (const p of list) stmts.upsertPlayer.run(p);
  });
  upsertPlayersTx(players);

  let stintCount = 0;
  let teamCount = 0;
  const batches = chunk(
    players.map((p) => p.id),
    PLAYER_BATCH
  );

  for (let b = 0; b < batches.length; b++) {
    process.stdout.write(
      `  careers batch ${b + 1}/${batches.length} (${batches[b].length} players)... `
    );
    const careerJson = await sparql(careersQuery(batches[b]));
    const bindings = careerJson.results?.bindings || [];

    const ingest = db.transaction((rows) => {
      let localStints = 0;
      const seenTeams = new Set();
      for (const row of rows) {
        const playerId = qidFromUri(row.player?.value);
        const teamId = qidFromUri(row.team?.value);
        if (!playerId || !teamId) continue;

        if (!seenTeams.has(teamId)) {
          seenTeams.add(teamId);
          stmts.upsertTeam.run({
            id: teamId,
            name_en: row.teamLabel?.value || teamId,
            name_tr: null,
            country: null,
            league: null,
            seeded: teamId === club.id ? 1 : 0,
          });
        }

        stmts.insertStint.run({
          player_id: playerId,
          team_id: teamId,
          start_date: yearOnly(row.start?.value),
          end_date: yearOnly(row.end?.value),
        });
        localStints += 1;
      }
      return { localStints, teams: seenTeams.size };
    });

    const stats = ingest(bindings);
    stintCount += stats.localStints;
    teamCount += stats.teams;
    console.log(`${stats.localStints} stints, ${stats.teams} teams`);
    await sleep(1200);
  }

  return { players: players.length, teams: teamCount, stints: stintCount };
}

function parseClubFilter(argv) {
  const onlyIdx = argv.indexOf("--only");
  if (onlyIdx === -1) return null;
  const raw = argv[onlyIdx + 1];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const quick = process.argv.includes("--quick");
  const skipLogos = process.argv.includes("--skip-logos");
  const only = parseClubFilter(process.argv);
  let clubs = quick ? QUICK_CLUBS : SEED_CLUBS;

  if (only) {
    clubs = SEED_CLUBS.filter(
      (c) =>
        only.includes(c.id) ||
        only.some((o) => c.nameEn.toLowerCase() === o.toLowerCase())
    );
    if (!clubs.length) {
      console.error(`--only ile eşleşen kulüp yok: ${only.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(
    `Wikidata sync başlıyor (${clubs.length} seed kulüp${quick ? ", quick mode" : ""})...\n`
  );

  const db = openDb();
  initSchema(db);
  const stmts = upsertStatements(db);

  const seedTx = db.transaction((list) => {
    for (const club of list) {
      stmts.upsertTeam.run({
        id: club.id,
        name_en: club.nameEn,
        name_tr: club.nameTr,
        country: club.country,
        league: club.league,
        seeded: 1,
      });
    }
  });
  seedTx(clubs);

  let totalPlayers = 0;
  let totalStints = 0;

  for (let i = 0; i < clubs.length; i++) {
    const stats = await syncClub(db, stmts, clubs[i], i, clubs.length);
    totalPlayers += stats.players;
    totalStints += stats.stints;
    await sleep(1500);
  }

  if (!skipLogos) {
    console.log("\nTakım logoları çekiliyor...");
    await syncTeamLogos(db, { force: false });
  }

  db.prepare(`
    INSERT INTO sync_meta(key, value) VALUES('last_sync', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM teams) AS teams,
        (SELECT COUNT(*) FROM players) AS players,
        (SELECT COUNT(*) FROM stints) AS stints,
        (SELECT COUNT(*) FROM teams WHERE logo_url IS NOT NULL AND logo_url != '') AS team_logos`
    )
    .get();

  console.log("\nSync tamamlandı.");
  console.log(
    `DB: ${counts.teams} takım, ${counts.players} oyuncu, ${counts.stints} stint, ${counts.team_logos} logo`
  );
  console.log(
    `Bu koşuda işlenen: ${totalPlayers} oyuncu, ${totalStints} stint satırı`
  );
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
