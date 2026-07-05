import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

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
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'notification',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = tokenData?.data;
    if (token) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    }
    return token;
  } catch (_) {}
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
  if (prof?.notification_prefs?.newChapter === false) return;

  await sendPush(token, {
    title: 'New comment on your series',
    body: `${commenterUsername} commented on ${seriesTitle}`,
    data: { type: 'comment', series_title: seriesTitle },
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
