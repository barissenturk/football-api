import { openDb, initSchema } from "../db.js";
import { sparql, sleep, chunk, qidFromUri, commonsImageUrl } from "./sparql.js";

const BATCH = 80;
const USER_AGENT =
  "FootballCommonPlayersAPI/1.0 (local educational project; contact: local-dev)";

function logosQuery(teamIds) {
  const values = teamIds.map((id) => `wd:${id}`).join(" ");
  return `
SELECT ?team ?logo ?enwiki ?trwiki WHERE {
  VALUES ?team { ${values} }
  OPTIONAL { ?team wdt:P154 ?logo }
  OPTIONAL {
    ?enArticle schema:about ?team ;
               schema:isPartOf <https://en.wikipedia.org/> ;
               schema:name ?enwiki .
  }
  OPTIONAL {
    ?trArticle schema:about ?team ;
               schema:isPartOf <https://tr.wikipedia.org/> ;
               schema:name ?trwiki .
  }
}
`.trim();
}

function isCrestLike(url) {
  if (!url) return false;
  // Reject obvious non-crest photos; allow svg/png crests
  if (/\.(svg|png)(\?|$)/i.test(url)) return true;
  return false;
}

async function wikipediaThumbnail(title, lang = "en") {
  if (!title) return null;
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.thumbnail?.source || json.originalimage?.source || null;
  } catch {
    return null;
  }
}

export async function syncTeamLogos(
  db,
  { force = false, seededOnly = false, wikiFallback = "popular" } = {}
) {
  let sql = `
    SELECT t.id, t.seeded, IFNULL(s.player_count, 0) AS player_count
    FROM teams t
    LEFT JOIN (
      SELECT team_id, COUNT(DISTINCT player_id) AS player_count
      FROM stints
      GROUP BY team_id
    ) s ON s.team_id = t.id
    WHERE 1=1
  `;
  if (!force) sql += ` AND (t.logo_url IS NULL OR t.logo_url = '')`;
  if (seededOnly) sql += ` AND t.seeded = 1`;
  sql += ` ORDER BY t.seeded DESC, IFNULL(s.player_count, 0) DESC, t.name_en ASC`;

  const teamRows = db.prepare(sql).all();
  const teams = teamRows.map((r) => r.id);
  const meta = new Map(teamRows.map((r) => [r.id, r]));
  console.log(`Logo sync: ${teams.length} takım${force ? " (force)" : ""}`);

  const updateLogo = db.prepare(`
    UPDATE teams
    SET logo_url = @logo_url, updated_at = datetime('now')
    WHERE id = @id
  `);

  let updated = 0;
  const batches = chunk(teams, BATCH);

  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`  batch ${i + 1}/${batches.length}... `);
    const json = await sparql(logosQuery(batches[i]));
    const bindings = json.results?.bindings || [];

    const pendingWiki = [];
    const found = new Map();

    for (const row of bindings) {
      const id = qidFromUri(row.team?.value);
      if (!id) continue;

      const p154 = row.logo?.value;
      if (isCrestLike(p154)) {
        found.set(id, commonsImageUrl(p154));
        continue;
      }

      const info = meta.get(id) || { seeded: 0, player_count: 0 };
      const allowWiki =
        wikiFallback === "all" ||
        (wikiFallback === "popular" &&
          (info.seeded === 1 || info.player_count >= 30));

      if (allowWiki) {
        pendingWiki.push({
          id,
          enwiki: row.enwiki?.value || null,
          trwiki: row.trwiki?.value || null,
        });
      }
    }

    // Wikipedia fallback (rate-limited lightly)
    let wikiHits = 0;
    for (const item of pendingWiki) {
      if (found.has(item.id)) continue;
      const thumb =
        (await wikipediaThumbnail(item.enwiki, "en")) ||
        (await wikipediaThumbnail(item.trwiki, "tr"));
      if (thumb) {
        found.set(item.id, thumb);
        wikiHits += 1;
      }
      await sleep(120);
    }

    const tx = db.transaction((entries) => {
      for (const [id, logo_url] of entries) {
        updateLogo.run({ id, logo_url });
      }
    });
    tx([...found.entries()]);
    updated += found.size;
    console.log(
      `${found.size} logo (wikidata crests + ${wikiHits} wikipedia)`
    );
    await sleep(1000);
  }

  return { checked: teams.length, updated };
}

async function main() {
  const force = process.argv.includes("--force");
  const seededOnly = process.argv.includes("--seeded");
  const wikiFallback = process.argv.includes("--wiki-all")
    ? "all"
    : "popular";

  const db = openDb();
  initSchema(db);

  // Drop known bad P154 photo assigned as "logo"
  db.prepare(
    `UPDATE teams SET logo_url = NULL
     WHERE logo_url LIKE '%Ciutat%Esportiva%'
        OR logo_url LIKE '%.jpg%'
        OR logo_url LIKE '%.jpeg%'`
  ).run();

  const result = await syncTeamLogos(db, { force, seededOnly, wikiFallback });

  const withLogo = db
    .prepare(
      `SELECT COUNT(*) AS c FROM teams WHERE logo_url IS NOT NULL AND logo_url != ''`
    )
    .get().c;

  console.log(`\nTamam: ${result.updated} güncellendi. DB'de logolu takım: ${withLogo}`);
  db.close();
}

const isDirectRun = process.argv[1] && /logos\.js$/i.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
