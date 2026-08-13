import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { searchMangaDex, getLatestChapter } from './mangaDexApi';
import { ALL_SUPPORTED_SITES, siteFaviconUrl } from './mangaSearch';
import { findPoolEntry } from './mangaPool';
import { isJunkTitle } from './titleValidation';

// Library cover badges — "NEW CHAPTER" counts and the per-series site
// favicon. Both used to be computed inside LibraryScreen on focus, so the
// badges visibly popped in seconds after the grid had already rendered (the
// chapter check is rate-limited network work). This module owns that state
// instead: the resolved values are persisted, hydrated into memory during
// app boot, and handed to LibraryScreen synchronously on first render, so
// badges are already correct the first time the tab is opened.

const STATE_KEY     = '@mangarecs/library_badges_v1';
const CACHE_KEY     = '@mangarecs/updates_cache';
// Retired. Tapping a cover used to record "don't badge me below this chapter",
// which meant a single tap silenced a series the user still hadn't read. The
// badge now lives and dies purely on read-position vs latest chapter, so the
// old entries are deleted on hydrate rather than left to keep suppressing it.
const LEGACY_DISMISSED_KEY = '@mangarecs/updates_dismissed';

const RESUME_PFX    = '@mangarecs/resume/';
const CACHE_TTL     = 2 * 60 * 60 * 1000; // re-check a series' latest chapter at most every 2h
// Every bookmarked/reading series is supposed to carry a live badge, so this
// has to cover a real library rather than its first screenful. Only uncached
// series spend budget, and a run is background fire-and-forget.
const MAX_NETWORK   = 60;                 // cap live MangaDex lookups per run
const RATE_LIMIT_MS = 500;                // pause between MangaDex calls

// key -> chapters-behind count (only entries with a live badge)
let _updates = new Map();
// key -> favicon url
let _siteIcons = new Map();
let _hydrated = false;
let _inFlight = null;

const _subscribers = new Set();

function notify() {
  for (const fn of _subscribers) {
    try { fn(); } catch (_) {}
  }
}

export function subscribeLibraryBadges(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

// Fresh Map copies per call so React sees a new reference and re-renders.
export function getLibraryBadgesSnapshot() {
  return { updates: new Map(_updates), siteIcons: new Map(_siteIcons) };
}

export function isLibraryBadgesHydrated() {
  return _hydrated;
}

async function persist() {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({
      updates: Object.fromEntries(_updates),
      siteIcons: Object.fromEntries(_siteIcons),
    }));
  } catch (_) {}
}

// Called once during app boot (App.js), alongside the other cache hydrators,
// so the previous session's resolved badges are in memory before any screen
// mounts. Cheap: a single AsyncStorage read, no network.
export async function hydrateLibraryBadges() {
  if (_hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.updates)   _updates   = new Map(Object.entries(parsed.updates).filter(([, v]) => v > 0));
      if (parsed?.siteIcons) _siteIcons = new Map(Object.entries(parsed.siteIcons).filter(([, v]) => !!v));
    }
  } catch (_) {}
  AsyncStorage.removeItem(LEGACY_DISMISSED_KEY).catch(() => {});
  _hydrated = true;
  notify();
}

// Stable identity for a library item, matching LibraryScreen's keyOf().
const keyOf = (s) => s?.searchKey || s?.title;

// One AsyncStorage read per series per run, shared by both resolvers below —
// they each need the same record, and this used to be fetched twice.
async function loadResumes(items) {
  const out = new Map();
  for (const s of items) {
    const key = keyOf(s);
    if (!key || out.has(key)) continue;
    let parsed = null;
    try {
      const raw = await AsyncStorage.getItem(RESUME_PFX + encodeURIComponent(key));
      if (raw) parsed = JSON.parse(raw);
    } catch (_) {}
    out.set(key, parsed);
  }
  return out;
}

// How far the user has actually read, or null if they've never opened this
// series at all. Bookmarking is not reading: "NEW CHAPTER" on something never
// started is meaningless — every chapter in it is new — so an untouched
// bookmark gets no badge until it has been opened at least once. Everything
// that HAS been opened is judged against the real read position, which is why
// a badge here outlives a tap on the cover.
function readChapterOf(s, resume) {
  const known = [s?.currentChapter, s?.chapter, resume?.chapter]
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return known.length ? Math.max(...known) : null;
}

// The favicon for whatever site a series was last read on.
//
// This used to resolve a bare site NAME by looking it up in
// ALL_SUPPORTED_SITES, which is a six-entry list of the sites offered in the
// picker. The reader opens far more than six — MangaKatana, Fanfox, MangaPill,
// Comick, Natomanga and everything in the fallback chain — so for most of them
// the lookup simply failed and the cover showed no icon at all.
//
// `url` is the second argument for exactly that reason: the resume blob also
// stores the page URL the reader was on, and a host is all a favicon needs. Any
// site resolves from it, listed or not.
function resolveSiteFavicon(site, url) {
  if (typeof site === 'object' && site?.url) return siteFaviconUrl(site.url);
  if (typeof site === 'string' && site) {
    if (/^https?:\/\//i.test(site)) return siteFaviconUrl(site);
    const match = ALL_SUPPORTED_SITES.find((s) => s.name.toLowerCase() === site.toLowerCase());
    if (match) return siteFaviconUrl(match.url);
  }
  // Fall back to the URL actually being read. This is what makes an icon
  // appear for the long tail of sites rather than only the picker's six.
  if (url && /^https?:\/\//i.test(url)) return siteFaviconUrl(url);
  return null;
}

// Purely local (reader resume data already on-device) — no network, so this
// runs for every item rather than a capped subset, and resolves fast enough
// that icons are ready well before the grid paints.
function resolveSiteIcons(items, resumes) {
  let changed = false;
  for (const s of items) {
    const key = keyOf(s);
    if (!key) continue;
    const resume = resumes.get(key);
    // No resume yet, but the library entry itself may already know the site —
    // it is saved alongside the reading history. Falling back to it is what
    // keeps the icon present on a device that has the series but no resume
    // blob for it yet (a fresh install that restored history, say).
    const site = resume?.site ?? s?.site;
    const url = resume?.url ?? s?.url;
    if (!site && !url) continue; // nothing to go on — leave any existing entry alone
    const favicon = resolveSiteFavicon(site, url);
    // Only ever set. A failure to resolve is not evidence the series has no
    // site — it used to delete a perfectly good icon, which is why icons
    // appeared to reset on their own.
    if (favicon && _siteIcons.get(key) !== favicon) {
      _siteIcons.set(key, favicon);
      changed = true;
    }
  }
  return changed;
}

// Caches the expensive part (MangaDex's "latest chapter" lookup) but always
// compares it against the item's LIVE read position, so a badge appears for
// every started series that has chapters the user hasn't reached and clears
// only once they actually read up to it — nothing else takes it away.
async function resolveChapterUpdates(items, resumes) {
  let cache = {};
  try {
    const cacheRaw = await AsyncStorage.getItem(CACHE_KEY);
    cache = cacheRaw ? JSON.parse(cacheRaw) : {};
  } catch (_) {}

  const now = Date.now();
  let changed = false;
  let networkBudget = MAX_NETWORK;

  for (const s of items) {
    const key = keyOf(s);
    if (!key) continue;

    const resume = resumes.get(key);
    const readCh = readChapterOf(s, resume);
    // Never opened — no badge, and no network spent working that out, which
    // leaves the whole budget for series the user is actually following.
    if (readCh == null) {
      if (_updates.has(key)) { _updates.delete(key); changed = true; }
      continue;
    }

    const cached = cache[key];
    let latest = null;

    if (cached && now - cached.ts < CACHE_TTL) {
      latest = cached.latest;
    } else if (networkBudget > 0) {
      networkBudget--;
      // Prefer the id the reader already resolved (resume data); fall back to
      // a title search — same approach as the push-notification checker in
      // utils/chapterUpdates.js — so series read on a web source, never
      // opened via the API reader, still get checked instead of being skipped.
      let mangaId = cached?.mangaId || null;
      if (!mangaId && resume?.mode === 'api' && resume?.mangaId) mangaId = resume.mangaId;
      if (!mangaId) {
        try { mangaId = (await searchMangaDex(key))?.id || null; } catch (_) {}
      }
      if (mangaId) {
        try { latest = await getLatestChapter(mangaId); } catch (_) {}
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS)); // respect MangaDex rate limits
      }
      cache[key] = { ts: now, latest, mangaId };
    } else {
      // Out of network budget and no fresh cache — leave whatever this key
      // already had rather than incorrectly clearing its badge.
      continue;
    }

    const isNew = latest != null && latest > readCh;
    const count = isNew ? Math.max(1, Math.floor(latest) - Math.floor(readCh)) : 0;

    if (count > 0) {
      if (_updates.get(key) !== count) { _updates.set(key, count); changed = true; }
    } else if (_updates.has(key)) {
      _updates.delete(key); changed = true;
    }
  }

  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
  return changed;
}

// Single entry point for recomputing badges. Merges into the existing maps —
// only keys actually examined this run are touched, so overlapping runs over
// different item subsets can never wipe each other's results. Serialized via
// _inFlight so concurrent callers (boot prewarm + Library focus) share one
// pass instead of racing and double-hitting the network.
export function refreshLibraryBadges(items) {
  const list = (items || []).filter((s) => keyOf(s));
  if (!list.length) return Promise.resolve();
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const resumes = await loadResumes(list);
      // Icons first: local-only and near-instant, so they show immediately
      // instead of waiting behind the rate-limited chapter lookups.
      if (resolveSiteIcons(list, resumes)) { notify(); await persist(); }
      if (await resolveChapterUpdates(list, resumes)) { notify(); await persist(); }
    } catch (_) {
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

// Boot-time warm-up: gathers the same item set the Library grid will show
// (server reading/bookmarked/completed rows + locally-saved bookmarks) and
// resolves badges for it, so they're ready before the tab is ever opened.
// Fire-and-forget — never block app start on it.
export async function prewarmLibraryBadges(userId) {
  try {
    const items = [];
    const seen = new Set();
    const add = (item) => {
      const key = keyOf(item);
      if (!key || seen.has(key) || isJunkTitle(item.title)) return;
      seen.add(key);
      items.push(item);
    };

    if (userId) {
      const { data } = await supabase
        .from('reading_progress')
        .select('series_title, current_chapter, total_chapters, status, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      for (const r of data || []) {
        if (!r.series_title) continue;
        const pool = findPoolEntry(r.series_title);
        // A bookmarked row only carries a chapter if the user has actually
        // read some of it; defaulting it to 1 like the reading/completed rows
        // would make every untouched bookmark look started and badge it.
        const started = r.status === 'reading' || r.status === 'completed';
        add({
          title: r.series_title,
          searchKey: pool?.searchKey || r.series_title,
          currentChapter: r.current_chapter || (started ? 1 : null),
          chapters: r.total_chapters || pool?.chapters || 999,
        });
      }
    }

    try {
      const savedRaw = await AsyncStorage.getItem('@mangarecs_saved');
      for (const s of (savedRaw ? JSON.parse(savedRaw) : [])) {
        if (s?.downloaded) continue;
        add(s);
      }
    } catch (_) {}

    if (items.length) await refreshLibraryBadges(items);
  } catch (_) {}
}
