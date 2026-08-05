// Library import from AniList and MyAnimeList.
//
// This is the single biggest install-conversion lever in the tracker category
// — Kenmei, MangaTime and MangaTrack all lead their store listings with it,
// because nobody re-enters 300 series by hand. Most of the plumbing already
// existed (utils/anilist.js talks to the GraphQL API, profiles carries
// mal_username / anilist_username); what was missing was the write path into
// reading_progress.
//
// Read-only and unauthenticated on both sides:
//
//   AniList — public GraphQL, list is readable by username. No OAuth.
//   MAL     — the official v2 API needs a registered client id for even read
//             access, so this uses Jikan (the community read-only mirror),
//             which is public, rate-limited, and returns the same list.
//
// Nothing here overwrites progress the user already has. An import is
// additive: a series already in the library keeps whichever chapter number is
// further along, because the local one may well be newer than the tracker.
import { supabase } from '../supabase';
import { isJunkTitle } from './titleValidation';
import { reportError } from './crashReporting';

const ANILIST_API = 'https://graphql.anilist.co';
const JIKAN_API = 'https://api.jikan.moe/v4';

// Supabase upserts in one round trip, but a 900-entry list in a single
// statement is a request big enough to time out on mobile data.
const UPSERT_CHUNK = 200;

// Both services use their own status vocabulary. reading_progress stores the
// app's own set, which the Library tabs read directly.
const ANILIST_STATUS = {
  CURRENT: 'reading',
  REPEATING: 'reading',
  COMPLETED: 'completed',
  PLANNING: 'bookmarked',
  PAUSED: 'bookmarked',
  DROPPED: 'dropped',
};

const MAL_STATUS = {
  reading: 'reading',
  completed: 'completed',
  on_hold: 'bookmarked',
  plan_to_read: 'bookmarked',
  dropped: 'dropped',
};

const LIST_QUERY = `
query ($name: String) {
  MediaListCollection(userName: $name, type: MANGA) {
    lists {
      entries {
        status
        progress
        media { chapters title { romaji english } }
      }
    }
  }
}`;

/** Normalised entry shape both sources produce. */
function entry(title, status, chapter, total) {
  return {
    title: String(title || '').trim(),
    status,
    current_chapter: Math.max(0, Number(chapter) || 0),
    total_chapters: Number(total) || null,
  };
}

/**
 * Fetch an AniList user's full manga list as importable entries.
 * @returns {Promise<{ok: true, entries: Array} | {ok: false, reason: string}>}
 */
export async function fetchAnilistLibrary(username) {
  const name = (username || '').trim();
  if (!name) return { ok: false, reason: 'no-username' };
  try {
    const resp = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: LIST_QUERY, variables: { name } }),
    });
    if (resp.status === 404) return { ok: false, reason: 'not-found' };
    if (!resp.ok) return { ok: false, reason: 'unavailable' };
    const json = await resp.json();
    // AniList answers 200 with an errors array for a missing user.
    if (json?.errors?.length) return { ok: false, reason: 'not-found' };
    const lists = json?.data?.MediaListCollection?.lists;
    if (!lists) return { ok: false, reason: 'not-found' };

    const out = [];
    for (const l of lists) {
      for (const e of l.entries || []) {
        const title = e.media?.title?.english || e.media?.title?.romaji;
        if (!title || isJunkTitle(title)) continue;
        out.push(entry(title, ANILIST_STATUS[e.status] || 'bookmarked', e.progress, e.media?.chapters));
      }
    }
    return { ok: true, entries: dedupe(out) };
  } catch (e) {
    reportError(e, 'import.anilist');
    return { ok: false, reason: 'network' };
  }
}

/**
 * Fetch a MyAnimeList user's manga list via Jikan.
 *
 * Jikan pages at 300 entries and rate-limits to roughly 3 req/s, so this
 * walks pages with a small gap. A large list takes a few seconds — the caller
 * gets progress via `onPage`.
 */
export async function fetchMalLibrary(username, { onPage } = {}) {
  const name = (username || '').trim();
  if (!name) return { ok: false, reason: 'no-username' };
  const out = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const resp = await fetch(`${JIKAN_API}/users/${encodeURIComponent(name)}/mangalist?page=${page}`, {
        headers: { Accept: 'application/json' },
      });
      if (resp.status === 404) return { ok: false, reason: 'not-found' };
      // Jikan answers 429 when the per-second budget is exceeded. Back off
      // once rather than failing the whole import.
      if (resp.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        page--;
        continue;
      }
      if (!resp.ok) return { ok: false, reason: 'unavailable' };
      const json = await resp.json();
      const rows = json?.data || [];
      for (const r of rows) {
        const title = r?.manga?.title || r?.entry?.title;
        if (!title || isJunkTitle(title)) continue;
        out.push(entry(
          title,
          MAL_STATUS[r.status] || MAL_STATUS[String(r.status || '').toLowerCase()] || 'bookmarked',
          r.read_chapters ?? r.chapters_read,
          r?.manga?.chapters ?? r?.entry?.chapters,
        ));
      }
      onPage?.(out.length);
      if (!json?.pagination?.has_next_page) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    return { ok: true, entries: dedupe(out) };
  } catch (e) {
    reportError(e, 'import.mal');
    return { ok: false, reason: 'network' };
  }
}

// Same series can appear twice across a tracker's lists. Keep the furthest
// progress, and prefer a real reading status over a plan-to-read one.
function dedupe(entries) {
  const byTitle = new Map();
  const rank = { reading: 3, completed: 3, dropped: 2, bookmarked: 1 };
  for (const e of entries) {
    const key = e.title.toLowerCase();
    const prev = byTitle.get(key);
    if (!prev) { byTitle.set(key, e); continue; }
    byTitle.set(key, {
      ...prev,
      status: (rank[e.status] || 0) > (rank[prev.status] || 0) ? e.status : prev.status,
      current_chapter: Math.max(prev.current_chapter, e.current_chapter),
      total_chapters: prev.total_chapters || e.total_chapters,
    });
  }
  return [...byTitle.values()];
}

/**
 * Write imported entries into reading_progress.
 *
 * Additive by design: an existing row keeps the higher chapter number, so
 * importing an out-of-date tracker list can never roll a user's real progress
 * backwards. That's the failure mode people actually complain about.
 *
 * @returns {Promise<{added: number, updated: number, skipped: number}>}
 */
export async function applyLibraryImport(userId, entries, { onProgress } = {}) {
  if (!userId || !entries?.length) return { added: 0, updated: 0, skipped: 0 };

  const { data: existingRows, error } = await supabase
    .from('reading_progress')
    .select('series_title, current_chapter')
    .eq('user_id', userId);
  if (error) {
    reportError(error, 'import.readExisting');
    return { added: 0, updated: 0, skipped: entries.length };
  }

  const existing = new Map((existingRows || []).map((r) => [r.series_title.toLowerCase(), r]));
  const now = new Date().toISOString();
  const rows = [];
  let added = 0, updated = 0, skipped = 0;

  for (const e of entries) {
    const prev = existing.get(e.title.toLowerCase());
    if (!prev) {
      added++;
    } else if (e.current_chapter > (prev.current_chapter || 0)) {
      updated++;
    } else {
      skipped++;
      continue; // local progress is equal or further along — leave it alone
    }
    rows.push({
      user_id: userId,
      series_title: prev ? prev.series_title : e.title, // keep existing casing
      status: e.status,
      current_chapter: Math.max(e.current_chapter, prev?.current_chapter || 0),
      total_chapters: e.total_chapters,
      updated_at: now,
    });
  }

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error: upErr } = await supabase
      .from('reading_progress')
      .upsert(chunk, { onConflict: 'user_id,series_title' });
    if (upErr) {
      reportError(upErr, 'import.upsert', { chunkStart: i, size: chunk.length });
      // Count the rest as skipped rather than reporting a success that didn't
      // happen — a wrong number here is worse than a partial one.
      skipped += rows.length - i;
      return { added, updated, skipped };
    }
    onProgress?.(Math.min(i + chunk.length, rows.length), rows.length);
  }

  return { added, updated, skipped };
}
