// Works out which weekday each pool title usually drops on, from its real
// release history — run with: node scripts/bakeReleaseSchedule.mjs
//
// There is no published chapter-release calendar for manga/manhwa/manhua
// anywhere queryable: no official source states "this series drops
// Wednesdays". What DOES exist is the release record itself. MangaDex's
// public API returns per-chapter publishAt timestamps, and the pool already
// keys every title to a MangaDex UUID (mangaPool.js `mangaId`), so the drop
// day can be *derived* from what actually happened rather than asserted.
//
// That derivation is only honest when the pattern is real, so a title is
// only given a day when all three hold:
//   - at least MIN_SAMPLE dated chapters to look at
//   - at least MIN_SHARE of them landed on the same weekday
//   - something released within RECENT_DAYS, so it's a live schedule
// Anything scattered across the week is dropped rather than rounded to its
// most frequent day — "usually Tuesdays" off a 30% plurality is a guess
// wearing a fact's clothes.
//
// Baked to a static file rather than fetched per visitor: 537 requests from
// every browser would be abusive to a free API, and this changes slowly.
// Re-run weekly-ish.

import { MANGA_POOL } from '../utils/mangaPool.js';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/assets/schedule.json');

const API = 'https://api.mangadex.org';
const UA = 'MangaRecs/1.0 (+https://mangarecs.net)';
const CHAPTERS_PER_TITLE = 12;
const MIN_SAMPLE = 4;
const MIN_SHARE = 0.5;
const RECENT_DAYS = 60;
// MangaDex asks for 5 requests/second; stay under it.
const DELAY_MS = 260;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recentChapters(mangaId) {
  const url = `${API}/chapter?manga=${mangaId}&translatedLanguage%5B%5D=en`
    + `&order%5BpublishAt%5D=desc&limit=${CHAPTERS_PER_TITLE}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.json();
  // MangaDex parks scheduled/withheld chapters on far-future placeholder
  // dates (Dragon Ball comes back as 2037-12-31). Those sail straight through
  // a "released recently?" check and would land a finished series on the
  // schedule as if it were still running, so drop anything not yet published.
  const now = Date.now();
  return (body.data || [])
    .map((c) => ({ chapter: c.attributes?.chapter, publishAt: c.attributes?.publishAt }))
    .filter((c) => c.publishAt && new Date(c.publishAt).getTime() <= now);
}

// The modal weekday, but only when it's a real majority — see the note up top.
function inferDay(chapters) {
  const counts = new Array(7).fill(0);
  for (const c of chapters) counts[new Date(c.publishAt).getUTCDay()]++;
  const total = chapters.length;
  let best = 0;
  for (let i = 1; i < 7; i++) if (counts[i] > counts[best]) best = i;
  const share = counts[best] / total;
  return share >= MIN_SHARE ? { day: best, share } : null;
}

// A finished series still gets "new" MangaDex uploads when a group re-releases
// its early chapters, and a naive read of those timestamps says Demon Slayer
// drops on Wednesdays because someone re-posted chapter 4.5. Real forward
// progress means the newest upload is also the highest chapter number, so
// require that before believing a pattern.
function isProgressing(chapters) {
  const nums = chapters
    .map((c) => parseFloat(c.chapter))
    .filter((n) => !Number.isNaN(n));
  if (nums.length < MIN_SAMPLE) return false;
  const newest = nums[0];
  const highest = Math.max(...nums);
  return newest >= highest;
}

const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

// Manhwa and manhua only. The pool skews Japanese and so does English
// scanlation activity on MangaDex, so an unfiltered run fills the page with
// exactly the shonen this site is trying not to lead with.
const candidates = MANGA_POOL.filter(
  (m) => m.mangaId && !m.nsfw && (m.lang === 'ko' || m.lang === 'zh')
);
console.log(`Checking ${candidates.length} titles against MangaDex…`);

const scheduled = [];
let checked = 0;
let skippedThin = 0;
let skippedStale = 0;
let skippedIrregular = 0;
let skippedReupload = 0;
let failed = 0;

for (const m of candidates) {
  checked++;
  if (checked % 50 === 0) console.log(`  ${checked}/${candidates.length}…`);
  try {
    const chapters = await recentChapters(m.mangaId);
    if (chapters.length < MIN_SAMPLE) { skippedThin++; continue; }

    const latest = new Date(chapters[0].publishAt).getTime();
    if (latest < cutoff) { skippedStale++; continue; }
    if (!isProgressing(chapters)) { skippedReupload++; continue; }

    const inferred = inferDay(chapters);
    if (!inferred) { skippedIrregular++; continue; }

    scheduled.push({
      id: m.id,
      title: m.title,
      lang: m.lang || null,
      genres: (m.genres || []).slice(0, 2),
      cover: POOL_COVER_URLS[m.id] || null,
      day: inferred.day,
      confidence: Math.round(inferred.share * 100),
      latestChapter: chapters[0].chapter || null,
      latestAt: chapters[0].publishAt,
      sample: chapters.length,
    });
  } catch (err) {
    failed++;
  }
  await sleep(DELAY_MS);
}

scheduled.sort((a, b) => (b.confidence - a.confidence) || a.title.localeCompare(b.title));

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'MangaDex public API — chapter publishAt history',
  method: `Modal weekday of the last ${CHAPTERS_PER_TITLE} English chapters, kept only when `
    + `${Math.round(MIN_SHARE * 100)}%+ of them share it and something released in the last ${RECENT_DAYS} days.`,
  days: DAYS,
  titles: scheduled,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));

console.log(`\nWrote ${scheduled.length} scheduled titles to docs/assets/schedule.json`);
console.log(`  skipped: ${skippedThin} too few chapters, ${skippedStale} nothing recent, `
  + `${skippedIrregular} no consistent day, ${skippedReupload} re-uploads not real progress, `
  + `${failed} request failures`);
for (let d = 0; d < 7; d++) {
  console.log(`  ${DAYS[d]}: ${scheduled.filter((t) => t.day === d).length}`);
}
