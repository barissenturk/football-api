const SPARQL_URL = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "FootballCommonPlayersAPI/1.0 (local educational project; contact: local-dev)";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function qidFromUri(uri) {
  if (!uri) return null;
  const m = String(uri).match(/(Q\d+)$/);
  return m ? m[1] : null;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Normalize Commons / Wikidata image URIs to a usable Special:FilePath URL */
export function commonsImageUrl(value, width = 200) {
  if (!value) return null;
  let url = String(value);
  if (url.includes("Special:FilePath/")) {
    const base = url.split("?")[0];
    return `${base}?width=${width}`;
  }
  // bare filename from some dumps
  if (!url.startsWith("http")) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(url)}?width=${width}`;
  }
  return url;
}

export async function sparql(query, { retries = 5 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SPARQL_URL, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query }),
      });

      if (res.status === 429 || res.status >= 500) {
        const wait = 3000 * (attempt + 1);
        console.warn(`Wikidata ${res.status}, retry in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SPARQL ${res.status}: ${text.slice(0, 300)}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid JSON (${text.length} bytes). Query may be too large.`
        );
      }
    } catch (err) {
      lastError = err;
      const wait = 3000 * (attempt + 1);
      console.warn(`SPARQL error: ${err.message}. retry in ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastError;
}
