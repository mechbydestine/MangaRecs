// One-time script — run with: node scripts/bakeCoverUrls.mjs
// Queries MangaDex, AniList, Comick, and Jikan for every mangaPool entry,
// then writes utils/mangaPoolCovers.js with all found cover URLs hard-coded.
// Covers loaded from this file are instant and need no API call at runtime.

import { MANGA_POOL } from '../utils/mangaPool.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH   = join(__dirname, '../utils/mangaPoolCovers.js');
const DELAY_MS   = 380; // ~2.6 req/s — comfortably under MangaDex 5 req/s limit
const MDEX_BASE  = 'https://api.mangadex.org';
const LANG_MAP   = { ja: 'JP', ko: 'KR', zh: 'CN' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function norm(s)   { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }

function getAllTitles(manga) {
  const primary = Object.values(manga.attributes?.title || {});
  const alts    = (manga.attributes?.altTitles || []).flatMap(o => Object.values(o));
  return [...primary, ...alts];
}

function findBestMatch(data, query) {
  const q = norm(query);
  if (!q || !data?.length) return null;
  const exact = data.find(m => getAllTitles(m).some(t => norm(t) === q));
  if (exact) return exact;
  return data.find(m => getAllTitles(m).some(t => {
    const tl = norm(t);
    if (!tl) return false;
    const r = (tl.length - q.length) / q.length;
    if (Math.abs(r) > 0.4) return false;
    return tl.startsWith(q) || q.startsWith(tl);
  })) ?? null;
}

async function tryFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, ...opts });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function tryMangaDex(title, lang) {
  const lf = lang ? `&originalLanguage[]=${lang}` : '';
  const j  = await tryFetch(
    `${MDEX_BASE}/manga?title=${encodeURIComponent(title)}&limit=10&includes[]=cover_art&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive${lf}`
  );
  const manga = findBestMatch(j?.data, title);
  if (!manga) return null;
  const cv = manga.relationships?.find(r => r.type === 'cover_art');
  return cv?.attributes?.fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${cv.attributes.fileName}.512.jpg`
    : null;
}

async function tryAniList(title, lang) {
  const vars = { search: title, isAdult: false };
  const country = LANG_MAP[lang];
  if (country) vars.country = country;
  const j = await tryFetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: `query($search:String,$country:CountryCode,$isAdult:Boolean){Media(search:$search,type:MANGA,countryOfOrigin:$country,isAdult:$isAdult){coverImage{extraLarge large}}}`,
      variables: vars,
    }),
  });
  const img = j?.data?.Media?.coverImage;
  return img?.extraLarge || img?.large || null;
}

async function tryComick(title) {
  const j = await tryFetch(`https://api.comick.fun/v1.0/search?q=${encodeURIComponent(title)}&limit=5&type=comic`);
  const q   = norm(title);
  const hit = (Array.isArray(j) ? j : []).find(m => {
    const t = norm(m.title || m.slug);
    if (!t) return false;
    if (t === q) return true;
    const r = (t.length - q.length) / q.length;
    if (Math.abs(r) > 0.4) return false;
    return t.startsWith(q) || q.startsWith(t);
  });
  return hit?.cover_url || hit?.md_covers?.[0]?.gpurl || null;
}

async function tryJikan(title) {
  const j   = await tryFetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=5`);
  const q   = norm(title);
  const hit = (j?.data || []).find(m => {
    return [norm(m.title), norm(m.title_english)].filter(Boolean).some(c => {
      if (c === q) return true;
      const r = (c.length - q.length) / q.length;
      if (Math.abs(r) > 0.4) return false;
      return c.startsWith(q) || q.startsWith(c);
    });
  });
  return hit?.images?.jpg?.large_image_url || hit?.images?.jpg?.image_url || null;
}

async function getCover(entry) {
  const title = entry.searchKey || entry.title;
  const lang  = entry.lang;

  let url = await tryMangaDex(title, lang);
  if (url) return { url, src: 'mdex' };
  await sleep(120);

  if (lang) {
    url = await tryMangaDex(title, null);
    if (url) return { url, src: 'mdex-nolang' };
    await sleep(120);
  }

  url = await tryAniList(title, lang);
  if (url) return { url, src: 'anilist' };

  url = await tryComick(title);
  if (url) return { url, src: 'comick' };

  url = await tryJikan(title);
  if (url) return { url, src: 'jikan' };

  return null;
}

async function main() {
  const results = {};
  const srcs    = {};
  let found = 0;

  console.log(`Fetching covers for ${MANGA_POOL.length} entries...\n`);

  for (let i = 0; i < MANGA_POOL.length; i++) {
    const entry = MANGA_POOL[i];
    const label = (entry.searchKey || entry.title).substring(0, 44).padEnd(46);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${MANGA_POOL.length}] ${label}`);

    const result = await getCover(entry);
    if (result) {
      results[entry.id] = result.url;
      srcs[result.src]  = (srcs[result.src] || 0) + 1;
      found++;
      process.stdout.write(`✓ ${result.src}\n`);
    } else {
      process.stdout.write(`✗\n`);
    }

    await sleep(DELAY_MS);
  }

  const missed = MANGA_POOL.length - found;
  console.log(`\n✓ Found  : ${found}/${MANGA_POOL.length}`);
  console.log(`✗ Missed : ${missed}`);
  console.log('Sources  :', srcs);

  const lines  = Object.entries(results).map(([id, url]) => `  '${id}': '${url}',`);
  const banner = `// Auto-generated by scripts/bakeCoverUrls.mjs — do not edit manually.
// Regenerate: node scripts/bakeCoverUrls.mjs
// ${found}/${MANGA_POOL.length} covers resolved (${missed} missed — live API fallback handles those).
`;
  const output = `${banner}export const POOL_COVER_URLS = {\n${lines.join('\n')}\n};\n`;
  writeFileSync(OUT_PATH, output, 'utf8');
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(console.error);
