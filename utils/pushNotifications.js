import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

// registerPushToken used to swallow every failure in a single catch-all, so a
// broken token registration (bad projectId, expired session, network drop)
// left zero trace anywhere — no way to notice a chunk of users silently
// stopped getting push at all. This keeps a lightweight breadcrumb of the
// last failure (no backend table needed) and always logs with context.
const LAST_ERROR_KEY = '@mangarecs/last_push_registration_error';

async function recordPushError(stage, err) {
  console.warn('[push] registration failed at', stage, err?.message || err);
  try {
    await AsyncStorage.setItem(LAST_ERROR_KEY, JSON.stringify({
      stage,
      message: err?.message || String(err),
      at: new Date().toISOString(),
      platform: Platform.OS,
    }));
  } catch (_) {}
}

// expo-notifications cannot even be imported in Expo Go (SDK 53+) — dynamic require only in real builds
const isExpoGo = Constants.appOwnership === 'expo';
let Notifications = null;

if (!isExpoGo) {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Keeps the app icon's native badge count in sync with in-app unread state —
// otherwise it stays stuck at whatever a push notification last set it to,
// even after the user has read everything inside the app.
export async function syncBadgeCount(count) {
  if (isExpoGo || !Notifications) return;
  try { await Notifications.setBadgeCountAsync(Math.max(0, count)); } catch (_) {}
}

export async function registerPushToken(userId) {
  if (isExpoGo || !Notifications || !Device.isDevice) return;

  let finalStatus;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch (err) {
    recordPushError('permissions', err);
    return;
  }
  if (finalStatus !== 'granted') return; // user declined — expected, not an error

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'notification',
      });
    } catch (err) {
      recordPushError('android_channel', err);
      // Not fatal — token registration can still proceed without a channel.
    }
  }

  let token;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = tokenData?.data;
  } catch (err) {
    recordPushError('get_token', err);
    return;
  }
  if (!token) {
    recordPushError('get_token', new Error('getExpoPushTokenAsync returned no token'));
    return;
  }

  const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  if (error) {
    recordPushError('save_token', error);
    return;
  }
  return token;
}

async function sendPush(token, payload) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify({ to: token, sound: 'notification.mp3', ...payload }),
  });
}

export async function sendCommentPush(seriesTitle, commenterUsername) {
  const { data: series } = await supabase
    .from('series')
    .select('creator_id')
    .eq('title', seriesTitle)
    .maybeSingle();
  if (!series?.creator_id) return;

  const { data: prof } = await supabase
    .from('profiles')
    .select('push_token, notification_prefs')
    .eq('id', series.creator_id)
    .maybeSingle();
  const token = prof?.push_token;
  if (!token) return;
  if (prof?.notification_prefs?.comments === false) return;

  await sendPush(token, {
    title: 'New comment on your series',
    body: `${commenterUsername} commented on ${seriesTitle}`,
    data: { type: 'comment', series_title: seriesTitle },
  });
}

export async function sendDMPush(toUserId, fromUsername, preview) {
  const { data } = await supabase
    .from('profiles')
    .select('push_token, notification_prefs')
    .eq('id', toUserId)
    .maybeSingle();
  const token = data?.push_token;
  if (!token) return;
  if (data?.notification_prefs?.directMessages === false) return;

  await sendPush(token, {
    title: fromUsername,
    body: preview || 'Sent you a message',
    data: { type: 'direct_message' },
  });
}

export async function sendFriendRequestPush(toUserId, fromUsername) {
  const { data } = await supabase
    .from('profiles')
    .select('push_token, notification_prefs')
    .eq('id', toUserId)
    .maybeSingle();
  const token = data?.push_token;
  if (!token) return;
  if (data?.notification_prefs?.friendActivity === false) return;

  await sendPush(token, {
    title: 'New friend request',
    body: `${fromUsername} sent you a friend request`,
    data: { type: 'friend_request' },
  });
}
