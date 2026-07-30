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
const DISMISSED_KEY = '@mangarecs/updates_dismissed';

const CACHE_TTL     = 2 * 60 * 60 * 1000; // re-check a series' latest chapter at most every 2h
const MAX_NETWORK   = 20;                 // cap live MangaDex lookups per run
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
  _hydrated = true;
  notify();
}

// Stable identity for a library item, matching LibraryScreen's keyOf().
const keyOf = (s) => s?.searchKey || s?.title;

function resolveSiteFavicon(site) {
  if (!site) return null;
  if (typeof site === 'object') return siteFaviconUrl(site.url);
  if (typeof site === 'string') {
    if (/^https?:\/\//i.test(site)) return siteFaviconUrl(site);
    const match = ALL_SUPPORTED_SITES.find((s) => s.name.toLowerCase() === site.toLowerCase());
    return match ? siteFaviconUrl(match.url) : null;
  }
  return null;
}

// Purely local (reader resume data already on-device) — no network, so this
// runs for every item rather than a capped subset, and resolves fast enough
// that icons are ready well before the grid paints.
async function resolveSiteIcons(items) {
  let changed = false;
  for (const s of items) {
    const key = keyOf(s);
    if (!key) continue;
    let raw = null;
    try { raw = await AsyncStorage.getItem('@mangarecs/resume/' + encodeURIComponent(key)); } catch (_) {}
    if (!raw) continue; // no info either way — leave any existing entry alone
    try {
      const favicon = resolveSiteFavicon(JSON.parse(raw).site);
      if (favicon) {
        if (_siteIcons.get(key) !== favicon) { _siteIcons.set(key, favicon); changed = true; }
      } else if (_siteIcons.has(key)) {
        _siteIcons.delete(key); changed = true;
      }
    } catch (_) {}
  }
  return changed;
}

// Caches the expensive part (MangaDex's "latest chapter" lookup) but always
// compares it against the item's LIVE current chapter, so a badge clears the
// moment the user reads up to it rather than lingering until the cache entry
// expires.
async function resolveChapterUpdates(items) {
  let cache = {};
  let dismissed = {};
  try {
    const [cacheRaw, dismissedRaw] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(DISMISSED_KEY),
    ]);
    cache = cacheRaw ? JSON.parse(cacheRaw) : {};
    dismissed = dismissedRaw ? JSON.parse(dismissedRaw) : {};
  } catch (_) {}

  const now = Date.now();
  let changed = false;
  let networkBudget = MAX_NETWORK;

  for (const s of items) {
    const key = keyOf(s);
    if (!key) continue;

    const cached = cache[key];
    let latest = null;

    if (cached && now - cached.ts < CACHE_TTL) {
      latest = cached.latest;
    } else if (networkBudget > 0) {
      networkBudget--;
      // Prefer the id the reader already resolved (resume data); fall back to
      // a title search — same approach as the push-notification checker in
      // utils/chapterUpdates.js — so bookmarked or never-opened-via-API
      // series still get checked instead of being silently skipped.
      let mangaId = cached?.mangaId || null;
      if (!mangaId) {
        try {
          const resumeRaw = await AsyncStorage.getItem('@mangarecs/resume/' + encodeURIComponent(key));
          if (resumeRaw) {
            const resume = JSON.parse(resumeRaw);
            if (resume?.mode === 'api' && resume?.mangaId) mangaId = resume.mangaId;
          }
        } catch (_) {}
      }
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

    const currentCh = s.chapter || s.currentChapter || 1;
    const dismissedAt = dismissed[key];
    const isNew = latest != null && latest > currentCh && (dismissedAt == null || latest > dismissedAt);
    const count = isNew ? Math.max(1, Math.floor(latest) - Math.floor(currentCh)) : 0;

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
      // Icons first: local-only and near-instant, so they show immediately
      // instead of waiting behind the rate-limited chapter lookups.
      if (await resolveSiteIcons(list)) { notify(); await persist(); }
      if (await resolveChapterUpdates(list)) { notify(); await persist(); }
    } catch (_) {
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

// Opening a series clears its badge immediately rather than only once read
// up to, recorded against the currently-known latest chapter so a genuinely
// newer chapter later still re-shows it. Scoped to this one key — every
// other series keeps its badge until individually opened.
export async function dismissLibraryUpdate(key) {
  if (!key) return;
  if (_updates.has(key)) { _updates.delete(key); notify(); persist(); }
  try {
    const [cacheRaw, dismissedRaw] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(DISMISSED_KEY),
    ]);
    const latest = (cacheRaw ? JSON.parse(cacheRaw) : {})[key]?.latest;
    if (latest == null) return;
    const dismissed = dismissedRaw ? JSON.parse(dismissedRaw) : {};
    dismissed[key] = latest;
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch (_) {}
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
        add({
          title: r.series_title,
          searchKey: pool?.searchKey || r.series_title,
          currentChapter: r.current_chapter || 1,
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
