import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { isJunkTitle } from './titleValidation';

const _openedThisSession = new Set();
const GENRE_PREFS_KEY = '@mangarecs_genre_prefs';
const DAILY_LOG_KEY   = '@mangarecs_daily_log';
const HOUR_LOG_KEY    = '@mangarecs_hour_log';
const LAST_READ_KEY   = '@mangarecs_last_read';
const HISTORY_KEY     = '@mangarecs_reading_history';

// Date key in the user's LOCAL timezone. toISOString() is UTC — for users in
// UTC+ zones (JP/KR) it shifts reads to the previous day and breaks streaks.
export function localDateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function todayKey() {
  return localDateKey();
}

/**
 * Wraps a reading_progress write (upsert/update/delete) with one retry —
 * every call site for this table previously fired-and-forgot with no error
 * handling at all, so a transient network blip silently dropped the write
 * and the item just never showed up in the account. Retries once after a
 * beat, and only gives up silently-to-the-user (still logs in dev) after
 * both attempts fail — that's a real outage, not something a toast helps.
 */
export async function syncLibraryWrite(buildQuery, label) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await buildQuery();
      if (!error) return true;
      if (attempt === 1 && __DEV__) console.warn(`[library sync] ${label} failed:`, error.message);
    } catch (e) {
      if (attempt === 1 && __DEV__) console.warn(`[library sync] ${label} threw:`, e.message);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

/**
 * Call whenever a user opens a manga in the Reader.
 * Updates profiles.currently_reading and atomically increments chapters_read
 * (once per title per session).
 */
export function syncReadOpen(userId, title) {
  if (!userId || !title) return;

  supabase.from('profiles')
    .update({ currently_reading: title })
    .eq('id', userId)
    .then(() => {});

  if (!_openedThisSession.has(title)) {
    _openedThisSession.add(title);
    supabase.rpc('increment_chapters_read', { uid: userId }).then(() => {});
    supabase.from('activity_feed').insert({
      user_id: userId,
      type: 'chapter_read',
      data: { series_title: title },
    }).then(() => {});

    // manga_count is recomputed server-side from reading_progress rows
    supabase.rpc('recompute_manga_count').then(() => {});

    // Increment night_reads if reading between midnight and 4 AM
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      supabase.rpc('increment_night_reads', { uid: userId }).then(() => {});
    }
  }
}

/**
 * Increment shares_count when the user shares a series.
 */
export function incrementSharesCount(userId) {
  if (!userId) return;
  supabase.rpc('increment_shares_count', { uid: userId }).then(() => {});
}

/**
 * Save the most recently opened series so Library can show accurate "Continue Reading".
 */
export async function setLastRead(entry) {
  if (!entry?.title) return;
  const titleLower = entry.title.toLowerCase().trim();
  // Reject generic/invalid titles — site names, URLs, homepages/search pages,
  // the default "Reader" screen title
  if (isJunkTitle(entry.title)) return;
  if (/\.(com|to|net|io|org|me|pro|xyz|app|moe|gg)\b/.test(titleLower)) return;
  const data = {
    title: entry.title,
    searchKey: entry.searchKey || entry.title,
    chapter: entry.chapter || 1,
    chapterLabel: entry.chapterLabel || null,
    color: entry.color || '#1A1A2E',
    lang: entry.lang || 'ja',
    chapters: entry.chapters || 999,
    rating: entry.rating || null,
    site: entry.site || null,
    url: entry.url || null,
    updatedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(data));
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : {};
    history[data.searchKey] = data;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (_) {}
}

export async function getReadingHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const history = JSON.parse(raw);
    return Object.values(history).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (_) {
    return [];
  }
}

/**
 * Retrieve the most recently read series entry.
 */
export async function getLastRead() {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Increment genre weights for a given genres array.
 * Persists to AsyncStorage and syncs to Supabase profile.
 */
export async function updateGenreWeights(genres) {
  // Accept both comma-separated string ("Action, Fantasy") and array (["Action", "Fantasy"])
  const genreList = typeof genres === 'string'
    ? genres.split(',').map((g) => g.trim()).filter(Boolean)
    : (genres || []);
  if (!genreList.length) return;
  try {
    const raw = await AsyncStorage.getItem(GENRE_PREFS_KEY);
    const weights = raw ? JSON.parse(raw) : {};
    genreList.forEach((g) => { weights[g] = (weights[g] || 0) + 1; });
    await AsyncStorage.setItem(GENRE_PREFS_KEY, JSON.stringify(weights));
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const topGenre = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0];
      supabase.from('profiles').update({
        genre_weights: weights,
        genres_count: Object.keys(weights).length,
        ...(topGenre ? { favorite_genre: topGenre } : {}),
      }).eq('id', session.user.id).then(() => {});
    }
  } catch (_) {}
}

/**
 * Add hoursElapsed to today's reading log entry, and to the hour-of-day
 * histogram that powers MangaRecap's "peak reading time".
 */
export async function updateDailyLog(hoursElapsed) {
  if (!hoursElapsed || hoursElapsed <= 0) return;
  try {
    const key = todayKey();
    const raw = await AsyncStorage.getItem(DAILY_LOG_KEY);
    const log = raw ? JSON.parse(raw) : {};
    log[key] = (log[key] || 0) + hoursElapsed;
    await AsyncStorage.setItem(DAILY_LOG_KEY, JSON.stringify(log));

    // Hour-of-day bucket, in the reader's LOCAL time — same reasoning as
    // localDateKey: bucketing in UTC would misattribute late-night reads for
    // UTC+ readers, who are exactly what this stat is about. Attributed to the
    // hour the session ENDED; a session long enough to span hours is rare
    // enough that splitting it across buckets isn't worth the complexity.
    const hourRaw = await AsyncStorage.getItem(HOUR_LOG_KEY);
    const hourLog = hourRaw ? JSON.parse(hourRaw) : {};
    const hourKey = String(new Date().getHours());
    hourLog[hourKey] = (hourLog[hourKey] || 0) + hoursElapsed;
    await AsyncStorage.setItem(HOUR_LOG_KEY, JSON.stringify(hourLog));

    // Sync via merge_daily_log RPC — the server clamps per-day hours, merges
    // multi-device logs, and recomputes hours_read + streak_count itself.
    // (Direct writes to those columns are revoked; see migration section 36.)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      supabase.rpc('merge_daily_log', { p_log: log }).then(() => {});
      supabase.rpc('merge_hour_log', { p_log: hourLog }).then(() => {}, () => {});
    }
  } catch (_) {}
}

/**
 * Merges the local hour-of-day histogram with the cloud copy, taking the
 * higher value per bucket so the peak-time stat survives reinstalls and is
 * accurate across devices — same merge strategy as getMergedDailyLog.
 */
export async function getMergedHourLog(cloudLog = {}) {
  try {
    const raw = await AsyncStorage.getItem(HOUR_LOG_KEY);
    const localLog = raw ? JSON.parse(raw) : {};
    const cloud = cloudLog || {};
    const merged = {};
    new Set([...Object.keys(localLog), ...Object.keys(cloud)]).forEach((h) => {
      merged[h] = Math.max(localLog[h] || 0, cloud[h] || 0);
    });
    await AsyncStorage.setItem(HOUR_LOG_KEY, JSON.stringify(merged));
    return merged;
  } catch (_) {
    return cloudLog || {};
  }
}

/**
 * The contiguous 1-4h window of the day with the most real logged reading, as
 * a display string ("11PM – 2AM"). Returns null when there's no hour data at
 * all — the recap slide is skipped rather than inventing a window.
 */
export function peakReadingWindow(hourLog) {
  const log = hourLog || {};
  const hours = Array.from({ length: 24 }, (_, h) => log[String(h)] || 0);
  const total = hours.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  // Best contiguous 3-hour block, wrapping past midnight (a late-night reader's
  // real window is 23:00-01:00, which a non-wrapping scan would never find).
  let bestStart = 0, bestSum = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += hours[(start + k) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = start; }
  }
  const fmt = (h) => {
    const hr = ((h % 24) + 24) % 24;
    const suffix = hr < 12 ? 'AM' : 'PM';
    const display = hr % 12 === 0 ? 12 : hr % 12;
    return `${display}${suffix}`;
  };
  return {
    label: `${fmt(bestStart)} – ${fmt(bestStart + 3)}`,
    pct: Math.round((bestSum / total) * 100),
    // Consumers pick a time-appropriate icon off this (a moon over a 10AM
    // window read as a bug), so the raw hour has to survive formatting.
    startHour: bestStart,
  };
}

/**
 * Returns the full daily log: { "YYYY-MM-DD": hoursRead, ... }
 */
export async function getDailyLog() {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LOG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/**
 * Merges the local AsyncStorage daily log with the cloud copy (from profiles.daily_log).
 * For each day, takes the higher of the two values so total hours is accurate across
 * devices and after reinstalls. Saves the merged result back to local storage.
 */
export async function getMergedDailyLog(cloudLog = {}) {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LOG_KEY);
    const localLog = raw ? JSON.parse(raw) : {};
    const cloud = cloudLog || {};
    const allDays = new Set([...Object.keys(localLog), ...Object.keys(cloud)]);
    const merged = {};
    allDays.forEach((day) => {
      merged[day] = Math.max(localLog[day] || 0, cloud[day] || 0);
    });
    await AsyncStorage.setItem(DAILY_LOG_KEY, JSON.stringify(merged));
    return merged;
  } catch (_) {
    return cloudLog || {};
  }
}

/**
 * Calculate reading streak (consecutive days ending today or yesterday).
 */
export function calculateStreak(dailyLog) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tKey = localDateKey(today);
  const startOffset = (dailyLog[tKey] || 0) > 0 ? 0 : 1;
  let streak = 0;
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = localDateKey(d);
    if ((dailyLog[k] || 0) > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
