// Presence model: online (green) / idle (yellow) / busy (red, manual DND) /
// offline (grey — app backgrounded OR user chose to appear offline).
//
// `last_active_at` is refreshed on a heartbeat while the app is foregrounded,
// but the value written is the last real TOUCH time, not "now" — so if the
// user stops interacting (phone on the desk, app still open) the timestamp
// goes stale and every viewer's client independently computes "idle" once it's
// older than IDLE_AFTER_MS. No polling needed: whoever's looking just checks
// the age of the stored timestamp against their own clock.
import { supabase } from '../supabase';

const IDLE_AFTER_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

let lastTouchAt = Date.now();
let heartbeatTimer = null;
let heartbeatUserId = null;

export function markTouch() {
  lastTouchAt = Date.now();
}

export function computePresenceStatus(profile) {
  if (!profile) return 'offline';
  if (profile.show_activity === false) return 'offline';
  if (!profile.online) return 'offline';
  if (profile.is_busy) return 'busy';
  const lastActive = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
  if (Date.now() - lastActive > IDLE_AFTER_MS) return 'idle';
  return 'online';
}

export const PRESENCE_COLORS = {
  online: '#1D9E75',
  idle: '#EF9F27',
  busy: '#E5534B',
  offline: '#8E8E93',
};

export const PRESENCE_LABELS = {
  online: 'Online',
  idle: 'Idle',
  busy: 'Busy',
  offline: 'Offline',
};

export function startPresenceHeartbeat(userId) {
  stopPresenceHeartbeat();
  heartbeatUserId = userId;
  const tick = () => {
    if (!heartbeatUserId) return;
    supabase.from('profiles').update({
      last_active_at: new Date(lastTouchAt).toISOString(),
    }).eq('id', heartbeatUserId).then(() => {});
  };
  tick();
  heartbeatTimer = setInterval(tick, HEARTBEAT_MS);
}

export function stopPresenceHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  heartbeatUserId = null;
}
