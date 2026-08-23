// Single source of truth for notification preferences.
//
// Three places have to agree on what a toggle means: the Settings UI that
// renders it, the in-app notification list that hides muted rows, and the
// Edge Functions that decide whether to send a push. They used to agree by
// coincidence — Settings hard-coded four English labels, `notify-user` kept
// its own copy of the key names, and `chapter-push` checked nothing at all,
// so "New chapter alerts" was a switch wired to a dead end. Everything on the
// client now derives from PREF_GROUPS below; the functions mirror TYPE_TO_PREF.
//
// Keys are stored in user_push_settings.notification_prefs (migration 62) and
// mirrored to AsyncStorage so the UI is correct before the network answers.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFS_KEY = '@mangarecs/notifPrefs';

// `types` are `notifications.type` values; `systemKinds` are `data.kind`
// values on rows whose type is 'system' (the cron functions insert those).
export const PREF_GROUPS = [
  {
    title: 'settings.notifications.groupSeries',
    items: [
      { key: 'newChapter', icon: 'book-outline', types: ['new_chapter'], systemKinds: ['chapter_update'] },
    ],
  },
  {
    title: 'settings.notifications.groupSocial',
    items: [
      // No `likes` toggle: nothing in the app or the database ever inserts a
      // notification of type 'like', so the switch would control nothing.
      // (`settings.notifications.likes` strings are already translated for
      // whenever like notifications do ship.)
      { key: 'replies',    icon: 'return-down-forward-outline', types: ['reply'] },
      { key: 'comments',   icon: 'chatbubble-outline',          types: ['comment'] },
      { key: 'friendActivity', icon: 'people-outline',          types: ['friend_request', 'friend_accepted'] },
      { key: 'directMessages', icon: 'mail-outline',            types: ['direct_message'] },
    ],
  },
  {
    title: 'settings.notifications.groupProgress',
    items: [
      { key: 'badges', icon: 'ribbon-outline', types: ['badge'] },
    ],
  },
];

export const PREF_ITEMS = PREF_GROUPS.flatMap((g) => g.items);

// Everything is opt-out, not opt-in: a user who has never touched Settings
// should still be told their series updated.
export const NOTIF_PREF_DEFAULTS = Object.fromEntries(PREF_ITEMS.map((i) => [i.key, true]));

// type -> pref key, and system-kind -> pref key, derived so adding a group
// above is the only edit needed.
const TYPE_TO_PREF = {};
const SYSTEM_KIND_TO_PREF = {};
for (const item of PREF_ITEMS) {
  for (const t of item.types || []) TYPE_TO_PREF[t] = item.key;
  for (const k of item.systemKinds || []) SYSTEM_KIND_TO_PREF[k] = item.key;
}
export { TYPE_TO_PREF, SYSTEM_KIND_TO_PREF };

// Which toggle governs a raw notifications row, or null when nothing does.
// A null means "always show": moderation and report alerts are not something
// a user can mute, and an unrecognised future type must not vanish silently
// because no toggle exists for it yet.
export function prefKeyForRow(row) {
  if (!row) return null;
  if (row.type === 'system') return SYSTEM_KIND_TO_PREF[row.data?.kind] ?? null;
  return TYPE_TO_PREF[row.type] ?? null;
}

export function isRowAllowed(row, prefs) {
  const key = prefKeyForRow(row);
  if (!key) return true;
  // Explicit `false` only — an absent key is a pref the user has never set,
  // which defaults to on.
  return prefs?.[key] !== false;
}

// Normalises whatever is in storage against the current set of toggles, so a
// prefs blob written by an older build (which had `recommendations` and no
// `replies`) still produces a complete, correctly-defaulted object.
//
// Unrecognised keys are carried through rather than dropped: `recommendations`
// has no toggle in this UI but the streak-reminder function still reads it, so
// discarding it here would silently re-enable those pushes for every user who
// had turned them off.
export function normalizePrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...NOTIF_PREF_DEFAULTS };
  const out = { ...raw, ...NOTIF_PREF_DEFAULTS };
  for (const key of Object.keys(NOTIF_PREF_DEFAULTS)) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

// ── Live prefs ──────────────────────────────────────────────────────────────
// The notification list has to hide muted rows the moment a switch flips, not
// on the next cold start. Settings owns the write (it also has to reach
// Supabase and, when everything goes off, tear down the push token), so it
// publishes here afterwards and anyone rendering notifications subscribes.
const subscribers = new Set();

export async function readStoredPrefs() {
  try {
    const raw = await AsyncStorage.getItem(NOTIFS_KEY);
    return normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch (_) {
    return { ...NOTIF_PREF_DEFAULTS };
  }
}

export function publishPrefs(prefs) {
  for (const fn of subscribers) {
    try { fn(prefs); } catch (_) {}
  }
}

export function subscribePrefs(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
