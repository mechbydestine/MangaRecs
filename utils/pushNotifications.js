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

// Every user-to-user push now goes through the `notify-user` Edge Function.
//
// These functions used to read the RECIPIENT's push_token on this device and
// POST to Expo directly, which forced profiles.push_token to be world-readable
// (anyone with the shipped anon key could harvest every token) and left
// notification_prefs enforced on the *sender's* device, where it protects
// nobody. The function owns all of it now: recipient lookup, opt-out checks,
// block checks, and the sender's own name — which it takes from the JWT, so the
// "from" label can no longer be spoofed by the caller.
//
// The senders no longer take a `fromUsername` — callers used to fetch their own
// profile just to pass it, which was both a wasted round-trip and spoofable.
async function notify(payload) {
  // functions.invoke attaches the current session's access token as the
  // Authorization header, which is what the function identifies the sender from.
  const { error } = await supabase.functions.invoke('notify-user', { body: payload });
  // A push that doesn't land must never break the action that triggered it —
  // the message/comment/request itself is already committed by this point.
  if (error) console.warn('[push] notify-user failed', error?.message || error);
}

export async function sendCommentPush(seriesTitle) {
  // The recipient is resolved from the series server-side — passing a user id
  // from here would let a caller aim a "new comment" push at anyone.
  await notify({ type: 'comment', seriesTitle });
}

export async function sendDMPush(toUserId, preview) {
  await notify({ type: 'direct_message', recipientId: toUserId, preview });
}

export async function sendFriendRequestPush(toUserId) {
  await notify({ type: 'friend_request', recipientId: toUserId });
}
