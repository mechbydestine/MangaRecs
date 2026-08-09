import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { showAppAlert } from './appAlert';

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

// ── Permission priming ─────────────────────────────────────────────────────
// The OS notification dialog can only ever be shown ONCE per install. If the
// user says no there, no amount of later asking brings it back — the only
// recovery is a trip to system settings, which nobody makes. So it must not be
// spent on a cold start, which is what App.js used to do: registerPushToken()
// fired on session restore and again the instant auth state changed, meaning a
// brand-new account hit the dialog seconds after signup, before reading a
// single page and with no idea what it would be used for.
//
// Now it's primed: an in-app, branded ask that explains the benefit and can be
// declined harmlessly, and only a "yes" spends the real OS prompt. Declining
// leaves the OS dialog unspent so a later, better moment can still use it.
const PRIME_STATE_KEY = '@mangarecs/push_prime_state'; // unset | 'declined' | 'asked'

export async function getPushPrimeState() {
  try { return await AsyncStorage.getItem(PRIME_STATE_KEY); } catch (_) { return null; }
}

// Safe to call on cold start: refreshes the stored token for users who have
// ALREADY granted permission, and never shows a prompt of any kind. Expo tokens
// can rotate, so someone who opted in still needs this on launch — it just must
// not be the thing that asks.
export async function refreshPushTokenIfGranted(userId) {
  if (isExpoGo || !Notifications || !Device.isDevice || !userId) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return; // not granted — say nothing, ask later
  } catch (_) { return; }
  registerPushToken(userId);
}

// Call at a moment where the value is self-evident — a finished chapter, or
// following a series. `reason` picks the copy so the ask names the actual
// benefit rather than asking for a generic permission.
export async function maybePrimePushPermission(userId, reason = 'chapter') {
  if (isExpoGo || !Notifications || !Device.isDevice || !userId) return;

  const state = await getPushPrimeState();
  if (state) return; // already asked or already declined — never nag

  // If permission was somehow already granted (reinstall over a granted state),
  // skip the ask entirely and just make sure the token is on file.
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      await AsyncStorage.setItem(PRIME_STATE_KEY, 'asked');
      registerPushToken(userId);
      return;
    }
  } catch (_) {}

  const copy = reason === 'follow'
    ? {
        title: 'Get told when it updates?',
        body: "We'll send you a notification the moment a new chapter of a series you follow goes live. No other pings.",
      }
    : {
        title: 'Know when the next chapter drops?',
        body: "Turn on notifications and we'll tell you when a series you're reading updates — nothing else.",
      };

  showAppAlert(copy.title, copy.body, [
    {
      text: 'Not now',
      style: 'cancel',
      // Recorded as declined so we don't ask again on the next chapter, but the
      // OS prompt itself is left unspent.
      onPress: () => { AsyncStorage.setItem(PRIME_STATE_KEY, 'declined').catch(() => {}); },
    },
    {
      text: 'Notify me',
      onPress: () => {
        AsyncStorage.setItem(PRIME_STATE_KEY, 'asked').catch(() => {});
        registerPushToken(userId);
      },
    },
  ]);
}

// Re-opens the ask after a previous "Not now" — used by Settings, where the
// user has gone looking for it and the intent is explicit.
export async function resetPushPrime() {
  try { await AsyncStorage.removeItem(PRIME_STATE_KEY); } catch (_) {}
}

// ── Push state, for Settings ───────────────────────────────────────────────
// Until this existed there was no way to see, or fix, a user who had no push
// token: the only route to registration was advancing a chapter in the reader
// and accepting the prime, and a single "Not now" disabled that route
// permanently (maybePrimePushPermission returns early on any stored state, and
// nothing called resetPushPrime). Settings could not report the problem, let
// alone recover from it.
export async function getPushStatus(userId) {
  if (isExpoGo || !Notifications) return { supported: false, reason: 'expo-go' };
  if (!Device.isDevice) return { supported: false, reason: 'simulator' };

  let permission = 'undetermined';
  let canAskAgain = true;
  try {
    const res = await Notifications.getPermissionsAsync();
    permission = res?.status || 'undetermined';
    canAskAgain = res?.canAskAgain !== false;
  } catch (_) {}

  let hasToken = false;
  if (userId) {
    try {
      const { data } = await supabase
        .from('user_push_settings')
        .select('push_token')
        .eq('user_id', userId)
        .maybeSingle();
      hasToken = !!data?.push_token;
    } catch (_) {}
  }

  return {
    supported: true,
    permission,
    canAskAgain,
    hasToken,
    // Push only actually works when BOTH are true. Permission alone is the
    // trap: the OS says yes, but nothing was ever written to the table, so
    // every Edge Function still has nowhere to send.
    active: permission === 'granted' && hasToken,
    primeState: await getPushPrimeState(),
  };
}

// The explicit "turn this on" path. Clears any earlier "Not now" so the reader
// prime works again, then registers — which shows the OS dialog if it has not
// been spent yet. Returns why it failed so Settings can say something useful
// rather than silently doing nothing.
export async function enablePush(userId) {
  if (isExpoGo || !Notifications) return { ok: false, reason: 'expo-go' };
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  if (!userId) return { ok: false, reason: 'signed-out' };

  await resetPushPrime();

  let canAskAgain = true;
  let status = 'undetermined';
  try {
    const res = await Notifications.getPermissionsAsync();
    status = res?.status || 'undetermined';
    canAskAgain = res?.canAskAgain !== false;
  } catch (_) {}

  // Permanently denied at OS level — requestPermissionsAsync resolves instantly
  // with 'denied' and no dialog, so asking again just looks broken. The only
  // real recovery is the system settings app.
  if (status === 'denied' && !canAskAgain) return { ok: false, reason: 'blocked' };

  const token = await registerPushToken(userId);
  if (token) return { ok: true };

  // registerPushToken already recorded the specific stage that failed.
  let last = null;
  try { last = JSON.parse((await AsyncStorage.getItem(LAST_ERROR_KEY)) || 'null'); } catch (_) {}
  return { ok: false, reason: 'failed', detail: last?.stage || null };
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

  // Lives in user_push_settings, not profiles — profiles is world-readable, so
  // a token stored there was harvestable by anyone (migration 62).
  const { error } = await supabase
    .from('user_push_settings')
    .upsert({ user_id: userId, push_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
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

export async function sendReplyPush(toUserId, seriesTitle) {
  await notify({ type: 'reply', recipientId: toUserId, seriesTitle });
}

export async function sendFollowPush(toUserId) {
  await notify({ type: 'follow', recipientId: toUserId });
}
