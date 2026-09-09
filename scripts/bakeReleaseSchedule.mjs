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
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/assets/release-days.json');

// Findings accumulate here instead of being rediscovered every run. This
// exists because a run that couldn't reach MangaDex at all silently rewrote a
// 6-title schedule down to 1: every request failed, every failure looked
// exactly like "this title has no pattern", and the output was the truth
// about a network outage rather than the truth about release days.
//
// MangaDex rate-limits, and a full pass is ~490 requests, so getting blocked
// partway through is the normal case, not the exception. Merging into a cache
// makes a blocked run a no-op instead of a data loss, and lets the schedule be
// rebuilt (new ratio, new curation, new page design) with no network at all.
//   --offline   rebuild from cache only, make no requests
const CACHE = join(__dirname, 'release-days-cache.json');
const OFFLINE = process.argv.includes('--offline');

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

// MangaDex rate-limits hard, and a rejected request is indistinguishable from
// "this title has no schedule" unless it's retried: a first pass without this
// reported 254 failures and produced 17 titles where a slower one found 71.
async function fetchWithRetry(url, tries = 4) {
  let waitMs = 1200;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= tries) throw new Error(String(res.status));
    const header = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(header) && header > 0 ? header * 1000 : waitMs);
    waitMs *= 2;
  }
}

async function recentChapters(mangaId) {
  const url = `${API}/chapter?manga=${mangaId}&translatedLanguage%5B%5D=en`
    + `&order%5BpublishAt%5D=desc&limit=${SAMPLE}`;
  const res = await fetchWithRetry(url);
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

// Only AniList covers are usable. MangaDex's uploads host answers 403 to any
// request that isn't coming from its own site, browser User-Agent and Referer
// included, so those URLs are broken images anywhere on mangarecs.net. That is
// most of the pool: 65 of 71 titles with a derivable schedule have a MangaDex
// cover and therefore no usable art at all.
//
// Which is why the page no longer requires one. Demanding a cover cut a real
// 31-title schedule down to 6, and a schedule is a list of names and days, not
// a gallery — the page renders a lettered tile when there's no art.
const usableCover = (m) => {
  const url = POOL_COVER_URLS[m.id] || '';
  return /anilist/.test(url) ? url : null;
};

function entryFor(m, days, source, coverage) {
  return {
    id: m.id,
    title: m.title,
    cover: usableCover(m),
    format: { ja: 'Manga', ko: 'Manhwa', zh: 'Manhua', en: 'Webcomic' }[m.lang] || 'Manga',
    lang: m.lang,
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
// Japanese titles are checked too, but capped hard afterwards. Excluding them
// outright was leaving obvious weekly series off a page whose whole job is to
// say what drops when; including them unbounded would make it 63% shonen,
// since that's what MangaDex's English uploads skew to.
const candidates = MANGA_POOL.filter(
  (m) => m.mangaId && !m.nsfw
    && (m.lang === 'ko' || m.lang === 'zh' || m.lang === 'ja')
    && !results.has(m.id)
);

// { [poolId]: { days, coverage, checkedAt } } — only positive findings. A
// title that genuinely has no pattern is cheap to recheck; a title we simply
// couldn't reach must never be recorded as having no pattern.
let cache = {};
if (existsSync(CACHE)) {
  try { cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
}
console.log(`Curated: ${results.size}. Cache holds ${Object.keys(cache).length} derived patterns.`);

let checked = 0, thin = 0, stale = 0, reupload = 0, noPattern = 0, failed = 0, fresh = 0;

if (OFFLINE) {
  console.log('Offline mode: rebuilding from cache, no requests.');
} else {
  console.log(`Checking ${candidates.length} titles…`);
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
      cache[m.id] = { days: inferred.days, coverage: inferred.coverage, checkedAt: new Date().toISOString() };
      fresh++;
    } catch (e) {
      failed++;
      // Blocked outright (connection refused, not just throttled): every
      // remaining request will fail the same way, so stop rather than spend
      // ten minutes proving it.
      if (failed >= 25 && fresh === 0) {
        console.warn('  25 consecutive failures with nothing retrieved. MangaDex is refusing us; stopping.');
        break;
      }
    }
    await sleep(DELAY_MS);
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
}

// Everything the cache knows becomes an entry, whether this run reached the
// network or not.
let finished = 0;
for (const [id, hit] of Object.entries(cache)) {
  if (results.has(id)) continue;               // curated wins
  const m = byId.get(id);
  if (!m) continue;                            // dropped from the pool since
  // A finished series has no next chapter to schedule. isProgressing() can't
  // catch these on its own: a group re-uploading a completed run in order
  // looks exactly like ongoing weekly releases, which is how Claymore, Dr.
  // STONE and Assassination Classroom turned up on a release schedule.
  if (m.status === 'completed') { finished++; continue; }
  results.set(id, entryFor(m, hit.days, 'derived', hit.coverage));
}
if (finished) console.log(`  ${finished} cached pattern(s) skipped: series already finished.`);

// The pool carries some titles twice under different ids (one per cover
// source), which would list the same series twice under the same weekday.
const seenTitle = new Set();
const deduped = [...results.values()].filter((t) => {
  const k = t.title.trim().toLowerCase();
  if (seenTitle.has(k)) return false;
  seenTitle.add(k);
  return true;
});

// 80/20, the same ratio the rails and the spotlight hold to. Curated entries
// are never dropped; the cap only trims derived Japanese titles, best-evidence
// first, so what survives is the strongest-patterned of them.
const KZ_SHARE = 0.8;
const kz = deduped.filter((t) => t.lang !== 'ja');
const ja = deduped
  .filter((t) => t.lang === 'ja')
  .sort((a, b) => (b.source === 'curated') - (a.source === 'curated') || (b.coverage || 0) - (a.coverage || 0));
const jaAllowed = Math.max(0, Math.round((kz.length / KZ_SHARE) - kz.length));
const jaKept = ja.filter((t, i) => t.source === 'curated' || i < jaAllowed);

const titles = [...kz, ...jaKept].sort((a, b) => a.title.localeCompare(b.title));

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  days: DAYS,
  titles,
}, null, 2));

console.log(`\nWrote ${titles.length} titles to docs/assets/release-days.json`);
console.log(`  curated ${titles.filter((t) => t.source === 'curated').length}, `
  + `derived ${titles.filter((t) => t.source === 'derived').length}`);
console.log(`  manhwa/manhua ${kz.length}, manga ${jaKept.length} `
  + `(${Math.round(kz.length / titles.length * 100)}% non-manga; `
  + `${ja.length - jaKept.length} manga trimmed by the ratio cap)`);
console.log(`  with cover art ${titles.filter((t) => t.cover).length}, lettered tile ${titles.filter((t) => !t.cover).length}`);
console.log(`  skipped: ${thin} too few chapters, ${stale} nothing recent, `
  + `${reupload} re-uploads, ${noPattern} no clear pattern, ${failed} failures`);
for (let d = 0; d < 7; d++) {
  const n = titles.filter((t) => t.days.includes(d)).length;
  if (n) console.log(`  ${DAYS[d]}: ${n}`);
}
