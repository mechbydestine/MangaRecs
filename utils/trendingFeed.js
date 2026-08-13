import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchTrendingByLanguage } from './mangaDexApi';
import { MANGA_POOL } from './mangaPool';
import { POOL_COVER_URLS } from './mangaPoolCovers';

// The feed's Trending section.
//
// This replaces three sections — Hot Picks, Trending, Popular — that were
// measurably the same thing. Hot and Trending shared 22 of their top 25 (both
// sorted authored numbers that encode all-time fame), and Popular was a rating
// sort where eight titles tied at exactly 9.8 and ties broke by array order,
// so it returned an identical list on every build. Three labels, one idea.
//
// Two rules define what replaces them:
//
// 1. LANGUAGE QUOTAS. A single global ranking is always won by Japanese
//    classics, because that is what "most followed of all time" means. Manhwa
//    and manhua only surface if they are ranked among their own kind, so each
//    language gets a guaranteed number of slots rather than a chance at one.
//
// 2. SAMPLE, DON'T TAKE. Taking the top N is deterministic — same input, same
//    output, which is precisely the staleness complaint. Each language pulls a
//    ranked head of ~100 and picks randomly within it, so no two builds match
//    while everything shown is still genuinely near the top. Repetition still
//    happens, and that is fine: a title that keeps surviving the draw really is
//    what people are reading.

const CURSOR_KEY = '@mangarecs/trending_cursors_v1';

// Slots per build. Even thirds — the point is that manhwa and manhua are not
// garnish on a Japanese feed.
const QUOTA = [
  { lang: 'ko', count: 2 }, // manhwa
  { lang: 'zh', count: 2 }, // manhua
  { lang: 'ja', count: 2 }, // manga
];

// How deep the rotation walks before wrapping. 100 per page against a ~450
// title window means three pages covers most of what is actually active.
const PAGE = 100;
const MAX_PAGES = 3;

// lang -> offset into the ranking. Persisted, which is the fix for "I press
// home and it reloads the same thing": this used to be in-memory only, so
// every cold start reset the rotation to the very top of the list — i.e. back
// to Dragon Ball, forever.
let _cursors = {};
let _cursorsLoaded = false;

// Titles shown recently, so a resample doesn't hand back what is still on
// screen. Bounded — allowed to forget, because some repetition is wanted.
const _recent = [];
const RECENT_MAX = 40;

export async function loadTrendingCursors() {
  if (_cursorsLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(CURSOR_KEY);
    if (raw) _cursors = JSON.parse(raw) || {};
  } catch (_) {}
  _cursorsLoaded = true;
}

function advanceCursor(lang) {
  const next = ((_cursors[lang] || 0) + PAGE) % (PAGE * MAX_PAGES);
  _cursors[lang] = next;
  AsyncStorage.setItem(CURSOR_KEY, JSON.stringify(_cursors)).catch(() => {});
}

// Random sample without replacement, preferring titles not shown recently.
function sample(list, n) {
  const fresh = list.filter((m) => !_recent.includes(m.id));
  const from = fresh.length >= n ? fresh : list;
  const picked = [];
  const bag = [...from];
  while (picked.length < n && bag.length) {
    picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  return picked;
}

function remember(items) {
  for (const m of items) {
    _recent.push(m.id);
    if (_recent.length > RECENT_MAX) _recent.shift();
  }
}

// Offline / API-down path. Ranked the old way, because authored numbers are
// all the local catalogue has — but quota'd and sampled like the live path, so
// a failed fetch degrades to a worse Trending rather than to a shonen list.
// Entries with no resolvable cover are excluded: a letter in a box is not a
// discovery, and this section exists to be looked at.
function poolFallback(lang, count) {
  const parseReaders = (s) => {
    const n = parseFloat(s || '0');
    if ((s || '').includes('M')) return n * 1_000_000;
    if ((s || '').includes('K')) return n * 1_000;
    return n;
  };
  const langMatch = (m) => (m.lang || 'ja') === lang;
  const ranked = MANGA_POOL
    .filter((m) => !m.nsfw && langMatch(m) && (POOL_COVER_URLS[m.id] || m.coverUrl))
    .sort((a, b) => parseReaders(b.readers) - parseReaders(a.readers))
    .slice(0, 60);
  return sample(ranked, count);
}

// Builds one Trending block. Each language is fetched independently so a
// single slow or failing language can't take the others down with it, and
// every slot is backfilled from the local pool rather than left short.
export async function buildTrending({ excludeIds = new Set() } = {}) {
  await loadTrendingCursors();

  const perLang = await Promise.all(QUOTA.map(async ({ lang, count }) => {
    let live = [];
    try {
      live = await fetchTrendingByLanguage(lang, { offset: _cursors[lang] || 0 });
    } catch (_) {}
    const usable = live.filter((m) => !excludeIds.has(m.id));
    const picked = sample(usable, count);
    // Short — API down, or the window returned less than the quota. Top up
    // locally so the section is never partly empty.
    if (picked.length < count) {
      const have = new Set(picked.map((m) => m.id));
      picked.push(...poolFallback(lang, count - picked.length).filter((m) => !have.has(m.id)));
    }
    advanceCursor(lang);
    return picked;
  }));

  const out = perLang.flat();
  remember(out);
  // Interleaved, not grouped: three manhwa in a row reads as a manhwa app for
  // three screens. Round-robin keeps every few cards a change of language.
  const mixed = [];
  for (let i = 0; i < Math.max(...perLang.map((p) => p.length), 0); i++) {
    for (const list of perLang) if (list[i]) mixed.push(list[i]);
  }
  return mixed.map((m) => ({ ...m, _section: 'trending' }));
}

// Test hook — drops rotation and recency so a run starts from a known state.
export function _resetTrending() {
  _cursors = {};
  _cursorsLoaded = false;
  _recent.length = 0;
}
