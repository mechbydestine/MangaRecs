import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const _openedThisSession = new Set();
const GENRE_PREFS_KEY = '@inklore_genre_prefs';
const DAILY_LOG_KEY   = '@inklore_daily_log';
const LAST_READ_KEY   = '@inklore_last_read';
const HISTORY_KEY     = '@inklore_reading_history';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

    // Update manga_count: count distinct series titles ever read (include current)
    supabase.from('reading_progress').select('series_title').eq('user_id', userId)
      .then(({ data }) => {
        if (!data) return;
        const distinctCount = new Set([...data.map(r => r.series_title), title]).size;
        supabase.from('profiles').update({ manga_count: distinctCount }).eq('id', userId).then(() => {});
      });

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
const INVALID_TITLES = new Set([
  'reader', 'browser', 'inklore',
  'mangadex', 'mangafire', 'webtoon', 'asura scans', 'weeb central',
  'manga plus', 'mangahub', 'cubari proxy', 'dynasty reader', 'scans.gg',
  'likemanga', 'mangago', 'mangakatana', 'mangapill', 'manhuaplus',
  'manhuabuddy', 'mangakawaii', 'manganato', 'vymanga', 'zinmanga',
  'aqua manga', 'mangaball', 'mangafreak', 'mangafox', 'readmanga',
]);

export async function setLastRead(entry) {
  if (!entry?.title) return;
  const titleLower = entry.title.toLowerCase().trim();
  // Reject generic/invalid titles — site names, URLs, the default "Reader" screen title
  if (!titleLower || INVALID_TITLES.has(titleLower)) return;
  if (titleLower.startsWith('http')) return;
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
 * Add hoursElapsed to today's reading log entry.
 */
export async function updateDailyLog(hoursElapsed) {
  if (!hoursElapsed || hoursElapsed <= 0) return;
  try {
    const key = todayKey();
    const raw = await AsyncStorage.getItem(DAILY_LOG_KEY);
    const log = raw ? JSON.parse(raw) : {};
    log[key] = (log[key] || 0) + hoursElapsed;
    await AsyncStorage.setItem(DAILY_LOG_KEY, JSON.stringify(log));
    // Sync to Supabase immediately so friends see accurate streak data
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      supabase.from('profiles')
        .update({ daily_log: log, streak_count: calculateStreak(log) })
        .eq('id', session.user.id)
        .then(() => {});
    }
  } catch (_) {}
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
  const tKey = today.toISOString().slice(0, 10);
  const startOffset = (dailyLog[tKey] || 0) > 0 ? 0 : 1;
  let streak = 0;
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    if ((dailyLog[k] || 0) > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
