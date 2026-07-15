// One-time script — run with:
//   SUPABASE_TOKEN=sbp_xxx node scripts/seedRealMangaPool.mjs
// Replaces the deleted lib/mangadex.js scraper with a version that does it
// right: real bayesian ratings (native 0-10 scale, not a hardcoded 4.0), real
// cover_url, real follows-derived readers/likes, clean English/romaji titles.
// Fetches ~5000 manga from MangaDex (sorted by followedCount desc, paginated),
// dedupes against the curated titles already in utils/mangaPool.js, and
// inserts directly into the live manga_pool table via the Supabase
// Management API in small batches.

import { MANGA_POOL } from '../utils/mangaPool.js';

const TOKEN = process.env.SUPABASE_TOKEN;
const PROJECT_REF = 'jlzsnmwyyjefjekscvgs';
const TARGET_TOTAL = parseInt(process.env.SEED_TARGET, 10) || 5000;
const PAGE_SIZE = 100;
const BATCH_INSERT_SIZE = 200;
const DELAY_MS = 350;

if (!TOKEN) {
  console.error('Set SUPABASE_TOKEN env var first.');
  process.exit(1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
function sqlEscape(s) { return String(s).replace(/'/g, "''"); }

const existingTitles = new Set(MANGA_POOL.flatMap((m) => [norm(m.title), m.searchKey ? norm(m.searchKey) : null]).filter(Boolean));

async function runSql(query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await resp.json();
  if (!resp.ok || json?.message) throw new Error(`SQL error: ${json?.message || resp.status}`);
  return json;
}

const TAG_NAMES = {
  'Action': 'Action', 'Adventure': 'Adventure', 'Comedy': 'Comedy', 'Drama': 'Drama',
  'Fantasy': 'Fantasy', 'Horror': 'Horror', 'Mystery': 'Mystery', 'Romance': 'Romance',
  'Science Fiction': 'Sci-Fi', 'Slice of Life': 'Slice of Life', 'Sports': 'Sports',
  'Supernatural': 'Supernatural', 'Martial Arts': 'Martial Arts', 'Psychological': 'Psychological',
  'Historical': 'Historical', 'Thriller': 'Thriller', 'Isekai': 'Isekai', 'Wuxia': 'Martial Arts',
  'Xianxia': 'Fantasy', 'Mecha': 'Sci-Fi', 'Magic': 'Fantasy', 'School Life': 'Slice of Life',
  'Harem': 'Romance', 'Tragedy': 'Drama', 'Mafia': 'Action', 'Crime': 'Thriller',
};
const STATUS_MAP = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus', cancelled: 'cancelled' };
const DARK_COLORS = ['#0D1A2D','#1A0D0A','#0A1A2D','#2D1A0A','#0D0A2D','#1A2D0D','#2D0A0A','#0A0D1A'];
function stableColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return DARK_COLORS[Math.abs(h) % DARK_COLORS.length];
}
function formatReaders(n) {
  if (!n) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function normalizeManga(manga) {
  const attrs = manga.attributes || {};
  const titleObj = attrs.title || {};
  const altTitles = attrs.altTitles || [];
  const enAlt = altTitles.find((o) => o.en)?.en || null;
  const jaRoAlt = altTitles.find((o) => o['ja-ro'])?.['ja-ro'] || null;
  const koRoAlt = altTitles.find((o) => o['ko-ro'])?.['ko-ro'] || null;
  const rawFallback = Object.values(titleObj)[0] || 'Unknown';
  const isCjkPrimary = !titleObj.en && /[一-鿿぀-ヿ가-힯]/.test(rawFallback);
  const title = titleObj.en || (isCjkPrimary ? (jaRoAlt || koRoAlt || enAlt) : enAlt) || jaRoAlt || koRoAlt || rawFallback;
  const descObj = attrs.description || {};
  const rawDesc = descObj.en || Object.values(descObj)[0] || '';
  const desc = rawDesc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n+/g, ' ').trim().slice(0, 320);
  const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
  const coverUrl = coverRel?.attributes?.fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`
    : null;
  const authorRel = manga.relationships?.find((r) => r.type === 'author');
  const author = authorRel?.attributes?.name || null;
  const genres = (attrs.tags || [])
    .filter((t) => t.attributes?.group === 'genre')
    .map((t) => TAG_NAMES[t.attributes?.name?.en]).filter(Boolean).slice(0, 3);
  return {
    id: manga.id,
    title,
    lang: attrs.originalLanguage || 'ja',
    description: desc,
    genres: genres.length ? genres : ['Action'],
    chapters: parseInt(attrs.lastChapter) || 0,
    author,
    coverUrl,
    status: STATUS_MAP[attrs.status] || 'ongoing',
    contentRating: attrs.contentRating || 'safe',
    year: attrs.year || null,
  };
}

// Transient network blips (ECONNRESET etc.) shouldn't crash the whole run —
// retry a few times with backoff before giving up on a single page.
async function fetchWithRetry(url, opts = {}, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, opts);
      return resp;
    } catch (e) {
      if (i === attempts - 1) throw e;
      const wait = 1500 * (i + 1);
      process.stdout.write(` [${e.message || e}, retry in ${wait}ms] `);
      await sleep(wait);
    }
  }
}

async function fetchPage(offset) {
  const resp = await fetchWithRetry(
    `https://api.mangadex.org/manga?order[followedCount]=desc&limit=${PAGE_SIZE}&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive`,
    { headers: { Accept: 'application/json' } }
  );
  if (!resp.ok) return [];
  const json = await resp.json();
  return json?.data || [];
}

async function fetchStats(ids) {
  const out = {};
  const qs = ids.map((id) => `manga[]=${encodeURIComponent(id)}`).join('&');
  const resp = await fetchWithRetry(`https://api.mangadex.org/statistics/manga?${qs}`, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return out;
  const json = await resp.json();
  Object.entries(json?.statistics || {}).forEach(([id, s]) => {
    out[id] = {
      rating: s?.rating?.bayesian || s?.rating?.average || null,
      follows: s?.follows || 0,
    };
  });
  return out;
}

function buildInsertSql(rows) {
  const values = rows.map((r) => {
    const genresArr = `ARRAY[${r.genres.map((g) => `'${sqlEscape(g)}'`).join(',')}]::text[]`;
    return `('${r.id}', '${sqlEscape(r.title)}', '${r.lang}', ${r.description ? `'${sqlEscape(r.description)}'` : 'NULL'}, ${genresArr}, ${r.rating}, ${r.chapters}, ${r.readers ? `'${sqlEscape(r.readers)}'` : 'NULL'}, ${r.author ? `'${sqlEscape(r.author)}'` : 'NULL'}, 'recently', '${r.color}', ${r.likes}, 0, false, ${r.coverUrl ? `'${sqlEscape(r.coverUrl)}'` : 'NULL'}, '${r.status}', '${r.contentRating}', ${r.year || 'NULL'}, ${r.likes}, ${r.bookmarks}, ${r.shares})`;
  }).join(',\n');
  return `INSERT INTO manga_pool
  (id, title, lang, description, genres, rating, chapters, readers, author, updated, color, like_count, comment_count, nsfw, cover_url, status, content_rating, year, likes, bookmark_count, share_count)
VALUES
${values}
ON CONFLICT (id) DO NOTHING;`;
}

async function main() {
  const seenTitles = new Set(existingTitles);
  const seenIds = new Set();
  let pending = []; // rows fetched but not yet inserted — flushed once per BATCH_INSERT_SIZE
  let totalCollected = 0;
  let totalInserted = 0;
  const startOffset = parseInt(process.env.SEED_START_OFFSET, 10) || 0;
  let offset = startOffset;

  console.log(`Target: ${TARGET_TOTAL} real entries, deduped against ${existingTitles.size} curated titles. Starting at offset ${startOffset}.\n`);

  async function flush() {
    if (!pending.length) return;
    const sql = buildInsertSql(pending);
    await runSql(sql);
    totalInserted += pending.length;
    process.stdout.write(` -> inserted (running total ${totalInserted})\n`);
    pending = [];
  }

  while (totalCollected < TARGET_TOTAL) {
    const page = await fetchPage(offset);
    if (!page.length) { console.log('MangaDex ran out of results.'); break; }

    const normalized = page.map(normalizeManga).filter((m) => {
      if (seenIds.has(m.id)) return false;
      if (seenTitles.has(norm(m.title))) return false;
      seenIds.add(m.id);
      seenTitles.add(norm(m.title));
      return true;
    });

    await sleep(DELAY_MS);
    const stats = await fetchStats(page.map((m) => m.id));

    for (const m of normalized) {
      const s = stats[m.id];
      const rating = s?.rating ? Math.round(s.rating * 10) / 10 : 5.0;
      const follows = s?.follows || 0;
      pending.push({
        ...m,
        rating,
        readers: formatReaders(follows),
        likes: Math.min(80000, Math.round(follows * 0.03)),
        bookmarks: Math.min(20000, Math.round(follows * 0.018)),
        shares: Math.min(3000, Math.round(follows * 0.003)),
        color: stableColor(m.id),
      });
      totalCollected++;
    }

    offset += PAGE_SIZE;
    process.stdout.write(`[offset ${offset}] collected ${totalCollected}/${TARGET_TOTAL}`);
    if (pending.length >= BATCH_INSERT_SIZE) await flush();
    else process.stdout.write('\n');
    await sleep(DELAY_MS);
  }

  await flush(); // insert whatever's left over
  console.log(`\nDone. Inserted ${totalInserted} total. Last offset reached: ${offset}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
