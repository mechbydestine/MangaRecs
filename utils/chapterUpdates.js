import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../supabase';
import { searchMangaDex, getLatestChapter } from './mangaDexApi';

const CHECK_TS_KEY    = '@panelr_chapter_check_ts';
const NOTIFIED_KEY    = '@panelr_notified_chapters';
const NOTIF_PREFS_KEY = '@panelr_notif_prefs';
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

  // Get top N recently-read series and their current chapter from Supabase
  let seriesList = [];
  try {
    const { data } = await supabase
      .from('reading_progress')
      .select('series_title, current_chapter')
      .eq('user_id', userId)
      .eq('status', 'reading')
      .order('updated_at', { ascending: false })
      .limit(MAX_SERIES);
    seriesList = (data || []).map((r) => ({
      title: r.series_title,
      knownChapter: r.current_chapter || 0,
    }));
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

  for (const { title, knownChapter } of seriesList) {
    try {
      const result = await searchMangaDex(title);
      if (!result?.id) continue;

      const latest = await getLatestChapter(result.id);
      if (!latest) continue;

      const lastNotified = notifiedMap[title] ?? knownChapter;
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
      }
    } catch (_) {}
  }

  if (anyNew) {
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(updatedMap)).catch(() => {});
  }
}
