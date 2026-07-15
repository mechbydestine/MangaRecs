// One-time script — run with: node scripts/reconcileWithAniList.mjs
// Queries AniList for every entry in MANGA_POOL and reports (does NOT
// silently apply) what differs: title, description/synopsis, genres, rating.
// Writes a JSON report to scripts/reconcile-report.json for review, plus a
// human-readable summary to stdout. A second pass (applyReconcile.mjs)
// actually writes changes back into utils/mangaPool.js, and deliberately
// treats title changes on already-shipped entries as higher-risk than on
// brand-new ones (existing users' reading_progress/comments rows key off
// the `series_title` string, not the pool id — silently renaming a title
// that's already live would orphan real users' saved data from the pool).

import { MANGA_POOL } from '../utils/mangaPool.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const OUT_PATH    = join(__dirname, 'reconcile-report.json');
const PROGRESS_PATH = join(__dirname, 'reconcile-progress.json');
const DELAY_MS    = 1600; // AniList's public GraphQL limiter is much tighter than docs suggest — 900ms started 429ing after ~42 requests
const COUNTRY_MAP = { ja: 'JP', ko: 'KR', zh: 'CN' }; // 'en' intentionally unmapped (mostly not on AniList)

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Respects Retry-After when AniList 429s instead of hammering it — a fixed
// per-request delay alone isn't enough once the limiter trips.
async function fetchWithBackoff(url, opts, attempt = 0) {
  const resp = await fetch(url, opts);
  if (resp.status === 429 && attempt < 5) {
    const retryAfter = parseInt(resp.headers.get('retry-after'), 10);
    const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 10 * (attempt + 1)) * 1000;
    process.stdout.write(` [429, waiting ${Math.round(waitMs / 1000)}s] `);
    await sleep(waitMs);
    return fetchWithBackoff(url, opts, attempt + 1);
  }
  return resp;
}
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }

function cleanDescription(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<i>|<\/i>|<b>|<\/b>/gi, '')
    .replace(/\(Source[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

const GENRE_MAP = {
  'Action': 'Action', 'Adventure': 'Adventure', 'Comedy': 'Comedy', 'Drama': 'Drama',
  'Ecchi': 'Romance', 'Fantasy': 'Fantasy', 'Horror': 'Horror', 'Mahou Shoujo': 'Fantasy',
  'Mecha': 'Sci-Fi', 'Music': 'Slice of Life', 'Mystery': 'Mystery', 'Psychological': 'Psychological',
  'Romance': 'Romance', 'Sci-Fi': 'Sci-Fi', 'Slice of Life': 'Slice of Life', 'Sports': 'Sports',
  'Supernatural': 'Supernatural', 'Thriller': 'Thriller',
};

async function queryAniList(title, lang) {
  const query = `
    query ($search: String, $country: CountryCode) {
      Media(search: $search, type: MANGA, countryOfOrigin: $country, isAdult: false) {
        title { romaji english native }
        synonyms
        description(asHtml: false)
        genres
        meanScore
        chapters
        status
        countryOfOrigin
      }
    }`;
  const variables = { search: title };
  if (COUNTRY_MAP[lang]) variables.country = COUNTRY_MAP[lang];
  try {
    const resp = await fetchWithBackoff('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const json = await resp.json();
    return { media: json?.data?.Media || null };
  } catch (e) {
    return { error: e.message };
  }
}

function isExactMatch(media, entry) {
  const candidates = [
    media.title?.romaji, media.title?.english, media.title?.native,
    ...(media.synonyms || []),
  ].filter(Boolean).map(norm);
  const ours = [entry.title, entry.searchKey].filter(Boolean).map(norm);
  return ours.some((o) => candidates.includes(o));
}

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) return { done: {}, report: { matched: [], noMatch: [], errors: [] } };
  try { return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')); }
  catch { return { done: {}, report: { matched: [], noMatch: [], errors: [] } }; }
}
function saveProgress(state) {
  writeFileSync(PROGRESS_PATH, JSON.stringify(state), 'utf8');
}

async function main() {
  const state = loadProgress();
  const already = Object.keys(state.done).length;
  if (already > 0) console.log(`Resuming — ${already}/${MANGA_POOL.length} already done.\n`);
  console.log(`Reconciling ${MANGA_POOL.length} entries against AniList...\n`);

  for (let i = 0; i < MANGA_POOL.length; i++) {
    const entry = MANGA_POOL[i];
    if (state.done[entry.id]) continue; // resume support — skip already-processed entries

    const searchTitle = entry.searchKey || entry.title;
    const label = searchTitle.slice(0, 42).padEnd(44);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${MANGA_POOL.length}] ${label}`);

    const { media, error } = await queryAniList(searchTitle, entry.lang);
    state.done[entry.id] = true;

    if (error) {
      state.report.errors.push({ id: entry.id, title: entry.title, error });
      process.stdout.write(`ERR ${error}\n`);
    } else if (!media) {
      state.report.noMatch.push({ id: entry.id, title: entry.title, lang: entry.lang });
      process.stdout.write(`✗ no match\n`);
    } else if (!isExactMatch(media, entry)) {
      state.report.noMatch.push({
        id: entry.id, title: entry.title, lang: entry.lang,
        reason: 'fuzzy-only', anilistTitle: media.title?.english || media.title?.romaji,
      });
      process.stdout.write(`~ fuzzy, skipped\n`);
    } else {
      const newRating = media.meanScore ? Math.round((media.meanScore / 10) * 10) / 10 : null;
      const newDesc   = cleanDescription(media.description);
      const newGenres = (media.genres || []).map((g) => GENRE_MAP[g]).filter(Boolean).slice(0, 2);
      const anilistEnglishTitle = media.title?.english || null;

      state.report.matched.push({
        id: entry.id,
        currentTitle: entry.title,
        anilistTitle: anilistEnglishTitle || media.title?.romaji,
        titleDiffers: anilistEnglishTitle ? norm(anilistEnglishTitle) !== norm(entry.title) : false,
        currentRating: entry.rating,
        newRating,
        ratingDiffers: newRating != null && Math.abs((entry.rating || 0) - newRating) >= 0.3,
        currentGenres: entry.genres,
        newGenres: newGenres.length ? newGenres : null,
        currentDescLen: (entry.description || '').length,
        newDesc,
        status: media.status,
      });
      process.stdout.write(`✓ matched\n`);
    }

    // Checkpoint after every entry — a stop/crash mid-run loses at most one request.
    saveProgress(state);
    await sleep(DELAY_MS);
  }

  writeFileSync(OUT_PATH, JSON.stringify(state.report, null, 2), 'utf8');
  console.log(`\n✓ Matched : ${state.report.matched.length}/${MANGA_POOL.length}`);
  console.log(`✗ No match: ${state.report.noMatch.length}/${MANGA_POOL.length}`);
  console.log(`! Errors  : ${state.report.errors.length}/${MANGA_POOL.length}`);
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(console.error);
