import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { ALL_BADGES, computeEarnedBadgeIds, profileToBadgeStats } from './badges';
import { success as hapticSuccess } from './haptics';

const EARNED_KEY = '@mangarecs/earnedBadgeIds_v1';

async function getStoredEarnedIds() {
  try {
    const val = await AsyncStorage.getItem(EARNED_KEY);
    return val ? new Set(JSON.parse(val)) : null;
  } catch (_) { return null; }
}

async function storeEarnedIds(ids) {
  try {
    await AsyncStorage.setItem(EARNED_KEY, JSON.stringify([...ids]));
  } catch (_) {}
}

/**
 * Called whenever profile stats change. Detects newly-earned badges and:
 *  1. Writes them to the Supabase notifications table (in-app feed)
 *  2. Sends a push notification via Expo's push API
 *  3. Fires a success haptic
 *
 * Returns the array of newly-earned badge objects (may be empty).
 */
export async function checkAndNotifyBadges(userId, profile) {
  if (!userId || !profile) return [];

  const stats = profileToBadgeStats(profile);
  const newEarned = computeEarnedBadgeIds(stats);
  const prevEarned = await getStoredEarnedIds();

  // First launch: persist current state silently so we don't spam on first open
  if (!prevEarned) {
    await storeEarnedIds(newEarned);
    return [];
  }

  const newlyEarned = ALL_BADGES.filter((b) => !prevEarned.has(b.id) && newEarned.has(b.id));
  if (newlyEarned.length === 0) return [];

  await storeEarnedIds(newEarned);
  hapticSuccess();

  // Insert activity feed events for each newly earned badge
  supabase.from('activity_feed').insert(
    newlyEarned.map((badge) => ({
      user_id: userId,
      type: 'badge_earned',
      data: { badge_id: badge.id, badge_name: badge.name, badge_icon: badge.icon, badge_grade: badge.grade },
    }))
  ).then(() => {});

  // Insert in-app notification rows
  const rows = newlyEarned.map((badge) => ({
    user_id: userId,
    type: 'badge',
    actor_id: userId,
    data: {
      badge_id:    badge.id,
      badge_name:  badge.name,
      badge_grade: badge.grade,
      badge_icon:  badge.icon,
      badge_desc:  badge.desc,
    },
    read: false,
    created_at: new Date().toISOString(),
  }));

  supabase.from('notifications').insert(rows).then(() => {});

  // Push notifications (fire-and-forget, no await to keep non-blocking)
  getPushToken(userId).then((token) => {
    if (!token) return;
    newlyEarned.forEach((badge) => {
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify({
          to: token,
          title: `${badge.icon} Badge Unlocked!`,
          body: `You earned "${badge.name}" — ${badge.desc}`,
          data: { type: 'badge', badge_id: badge.id },
          sound: 'default',
        }),
      }).catch(() => {});
    });
  });

  return newlyEarned;
}

async function getPushToken(userId) {
  try {
    const { data } = await supabase.from('profiles').select('push_token').eq('id', userId).maybeSingle();
    return data?.push_token || null;
  } catch (_) { return null; }
}

/**
 * Wipe the local earned-badge cache (e.g. on sign-out so the next user starts fresh).
 */
export async function clearBadgeCache() {
  try { await AsyncStorage.removeItem(EARNED_KEY); } catch (_) {}
}
