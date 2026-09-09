// Builds the estimated weekly release schedule — run with:
//   node scripts/bakeReleaseSchedule.mjs
//
// Two sources, both legitimate, neither invented here:
//
//   1. CURATED — days someone actually knows, recorded by hand below. This is
//      editorial data, the same way a scanlation site or a TV guide knows its
//      own week. It is the primary source; add to it freely.
//
//   2. DERIVED — the weekday spread of a title's real English chapter uploads
//      on MangaDex, which the pool already keys to via `mangaId`. Only kept
//      when the pattern is strong enough to be worth asserting.
//
// Nothing is guessed. A title with no curated entry and no clear upload
// pattern simply doesn't appear.
//
// Days are a SET, not a single day, because that is how these actually
// release: The Devil Butler is 7 Sundays + 4 Saturdays out of 15, which an
// earlier single-day version of this script scored at 47% and discarded, when
// the true answer is plainly "weekends".

import { MANGA_POOL } from '../utils/mangaPool.js';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/assets/release-days.json');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

// ── 1. Curated ────────────────────────────────────────────────────────────
// id is the pool id from utils/mangaPool.js. days is which weekdays it
// usually drops on. Add entries here as they're confirmed.
const CURATED = [
  // Corroborated against upload history: 11 of its last 15 chapters landed on
  // a Saturday or Sunday.
  { id: 'tdb', days: [SAT, SUN] },
];

// ── 2. Derived ────────────────────────────────────────────────────────────
const API = 'https://api.mangadex.org';
const UA = 'MangaRecs/1.0 (+https://mangarecs.net)';
const SAMPLE = 15;
const MIN_SAMPLE = 6;
const COVERAGE = 0.7;   // the chosen days must account for this much activity
const MAX_DAYS = 3;     // more than three days isn't a schedule, it's noise
const RECENT_DAYS = 400;
const DELAY_MS = 260;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recentChapters(mangaId) {
  const url = `${API}/chapter?manga=${mangaId}&translatedLanguage%5B%5D=en`
    + `&order%5BpublishAt%5D=desc&limit=${SAMPLE}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json();
  // MangaDex parks scheduled/withheld chapters on far-future placeholder dates
  // (Dragon Ball comes back as 2037-12-31), which would otherwise sail through
  // every recency check.
  const now = Date.now();
  return (body.data || [])
    .map((c) => ({ chapter: c.attributes?.chapter, publishAt: c.attributes?.publishAt }))
    .filter((c) => c.publishAt && new Date(c.publishAt).getTime() <= now);
}

// A finished series still collects "new" uploads when a group re-posts its
// early chapters, and reading those timestamps literally says Demon Slayer
// drops on Wednesdays because someone re-uploaded chapter 4.5. Real forward
// progress means the newest upload is also the highest chapter number.
function isProgressing(chapters) {
  const nums = chapters.map((c) => parseFloat(c.chapter)).filter((n) => !Number.isNaN(n));
  if (nums.length < MIN_SAMPLE) return false;
  return nums[0] >= Math.max(...nums);
}

// Smallest set of weekdays covering COVERAGE of the uploads. Returns null when
// even MAX_DAYS can't get there — that's a title with no real schedule, and it
// should be left out rather than rounded to its busiest day.
function inferDays(chapters) {
  const counts = new Array(7).fill(0);
  for (const c of chapters) counts[new Date(c.publishAt).getUTCDay()]++;
  const total = chapters.length;
  const ranked = counts
    .map((n, day) => ({ day, n }))
    .sort((a, b) => b.n - a.n)
    .filter((x) => x.n > 0);

  const chosen = [];
  let covered = 0;
  for (const entry of ranked) {
    if (chosen.length >= MAX_DAYS) break;
    chosen.push(entry.day);
    covered += entry.n;
    if (covered / total >= COVERAGE) {
      return { days: chosen.sort((a, b) => a - b), coverage: Math.round((covered / total) * 100) };
    }
  }
  return null;
}

const hasRealCover = (m) => /anilist/.test(POOL_COVER_URLS[m.id] || '');

function entryFor(m, days, source, coverage) {
  return {
    id: m.id,
    title: m.title,
    cover: POOL_COVER_URLS[m.id] || null,
    format: { ja: 'Manga', ko: 'Manhwa', zh: 'Manhua', en: 'Webcomic' }[m.lang] || 'Manga',
    genres: (m.genres || []).slice(0, 2),
    days,
    source,
    coverage: coverage || null,
  };
}

const byId = new Map(MANGA_POOL.map((m) => [m.id, m]));
const results = new Map();

for (const c of CURATED) {
  const m = byId.get(c.id);
  if (!m) { console.warn(`  curated id not in pool, skipped: ${c.id}`); continue; }
  results.set(c.id, entryFor(m, c.days.slice().sort((a, b) => a - b), 'curated'));
}

const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
// Manhwa and manhua: both the pool and MangaDex's English uploads skew
// Japanese, and this site deliberately doesn't lead with shonen.
const candidates = MANGA_POOL.filter(
  (m) => m.mangaId && !m.nsfw && hasRealCover(m)
    && (m.lang === 'ko' || m.lang === 'zh')
    && !results.has(m.id)
);

console.log(`Curated: ${results.size}. Checking ${candidates.length} titles for a derivable pattern…`);

let checked = 0, thin = 0, stale = 0, reupload = 0, noPattern = 0, failed = 0;

for (const m of candidates) {
  checked++;
  if (checked % 25 === 0) console.log(`  ${checked}/${candidates.length}…`);
  try {
    const chapters = await recentChapters(m.mangaId);
    if (chapters.length < MIN_SAMPLE) { thin++; continue; }
    if (new Date(chapters[0].publishAt).getTime() < cutoff) { stale++; continue; }
    if (!isProgressing(chapters)) { reupload++; continue; }
    const inferred = inferDays(chapters);
    if (!inferred) { noPattern++; continue; }
    results.set(m.id, entryFor(m, inferred.days, 'derived', inferred.coverage));
  } catch (e) {
    failed++;
  }
  await sleep(DELAY_MS);
}

const titles = [...results.values()].sort((a, b) => a.title.localeCompare(b.title));

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  days: DAYS,
  titles,
}, null, 2));

console.log(`\nWrote ${titles.length} titles to docs/assets/release-days.json`);
console.log(`  curated ${titles.filter((t) => t.source === 'curated').length}, `
  + `derived ${titles.filter((t) => t.source === 'derived').length}`);
console.log(`  skipped: ${thin} too few chapters, ${stale} nothing recent, `
  + `${reupload} re-uploads, ${noPattern} no clear pattern, ${failed} failures`);
for (let d = 0; d < 7; d++) {
  const n = titles.filter((t) => t.days.includes(d)).length;
  if (n) console.log(`  ${DAYS[d]}: ${n}`);
}
