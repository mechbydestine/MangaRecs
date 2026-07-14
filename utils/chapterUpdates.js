import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../supabase';
import { searchMangaDex, getLatestChapter } from './mangaDexApi';

const CHECK_TS_KEY    = '@mangarecs_chapter_check_ts';
const NOTIFIED_KEY    = '@mangarecs_notified_chapters';
const NOTIF_PREFS_KEY = '@mangarecs_notif_prefs';
const CHECK_INTERVAL  = 4 * 60 * 60 * 1000; // 4 hours between checks
const MAX_SERIES      = 5;                    // check at most 5 series per run

const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
let Notifications = null;
if (!isExpoGo) {
  Notifications = require('expo-notifications');
}

export async function checkForNewChapters(userId) {
  if (!Notifications || !userId) return;

  // Rate-limit: skip if last check was <4 hours ago
  try {
    const lastTs = await AsyncStorage.getItem(CHECK_TS_KEY);
    if (lastTs && Date.now() - parseInt(lastTs, 10) < CHECK_INTERVAL) return;
  } catch (_) {}

  // Respect user's notification preference
  try {
    const prefsRaw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
    if (prefs.newChapter === false) return;
  } catch (_) {}

  // Mark check time immediately to prevent parallel runs
  await AsyncStorage.setItem(CHECK_TS_KEY, String(Date.now())).catch(() => {});

  // Get recently-touched series from both statuses — bookmarked series have
  // no reading progress, so they're fetched separately to keep actively-read
  // titles (which update far more often) from crowding them out of the cap.
  let seriesList = [];
  try {
    const [{ data: readingData }, { data: bookmarkedData }] = await Promise.all([
      supabase.from('reading_progress')
        .select('series_title, current_chapter')
        .eq('user_id', userId).eq('status', 'reading')
        .order('updated_at', { ascending: false }).limit(MAX_SERIES),
      supabase.from('reading_progress')
        .select('series_title, current_chapter')
        .eq('user_id', userId).eq('status', 'bookmarked')
        .order('updated_at', { ascending: false }).limit(MAX_SERIES),
    ]);
    seriesList = [
      ...(readingData || []).map((r) => ({ title: r.series_title, status: 'reading', knownChapter: r.current_chapter || 0 })),
      ...(bookmarkedData || []).map((r) => ({ title: r.series_title, status: 'bookmarked', knownChapter: r.current_chapter || 0 })),
    ];
  } catch (_) { return; }

  if (!seriesList.length) return;

  // Load map of last-notified chapter per series (avoids duplicate alerts)
  let notifiedMap = {};
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    if (raw) notifiedMap = JSON.parse(raw);
  } catch (_) {}

  const updatedMap = { ...notifiedMap };
  let anyNew = false;

  for (const { title, status, knownChapter } of seriesList) {
    try {
      const result = await searchMangaDex(title);
      if (!result?.id) continue;

      const latest = await getLatestChapter(result.id);
      if (!latest) continue;

      const hasBaseline = Object.prototype.hasOwnProperty.call(notifiedMap, title);
      // Bookmarked series have no "read up to" point, so the first check just
      // establishes the current latest chapter as the baseline instead of
      // firing a notification for every chapter that already existed before
      // the series was bookmarked.
      const lastNotified = hasBaseline
        ? notifiedMap[title]
        : (status === 'bookmarked' ? latest : knownChapter);

      if (latest > lastNotified) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'New chapter available!',
            body: `${title} — Chapter ${Math.floor(latest)} is out`,
            data: { type: 'new_chapter', series_title: title, chapter: latest },
            sound: 'notification.mp3',
          },
          trigger: null,
        });
        updatedMap[title] = latest;
        anyNew = true;
        // Brief pause between API calls to respect MangaDex rate limits
        await new Promise((r) => setTimeout(r, 600));
      } else if (!hasBaseline) {
        updatedMap[title] = lastNotified;
      }
    } catch (_) {}
  }

  if (anyNew || Object.keys(updatedMap).length !== Object.keys(notifiedMap).length) {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(updatedMap)).catch(() => {});
  }
}
