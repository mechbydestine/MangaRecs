// Network state.
//
// Before this, every failure looked identical to the user: airplane mode, dead
// Wi-Fi, a Supabase outage and an RLS denial all surfaced the same way, and
// mostly as nothing at all — a blank list and no explanation. FeedScreen even
// cached an offline snapshot but had no way to say *why* it was stale.
//
// `isConnected` is the radio; `isInternetReachable` is whether traffic
// actually gets anywhere (captive-portal Wi-Fi reports connected and drops
// everything). Treat null as "assume online": NetInfo reports null before its
// first probe completes, and blocking the UI on that would flash an offline
// banner on every cold start.
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

let _state = { isConnected: true, isInternetReachable: true };
const _listeners = new Set();

NetInfo.addEventListener((s) => {
  const next = {
    isConnected: s.isConnected !== false,
    isInternetReachable: s.isInternetReachable !== false,
  };
  if (next.isConnected === _state.isConnected && next.isInternetReachable === _state.isInternetReachable) return;
  _state = next;
  _listeners.forEach((fn) => fn(_state));
});

/** Synchronous snapshot, for non-React callers (API helpers, retry loops). */
export function isOnline() {
  return _state.isConnected && _state.isInternetReachable;
}

/**
 * Fresh probe rather than the cached snapshot. Use before a write the user
 * explicitly triggered, where a stale "online" would mean a silent no-op.
 */
export async function checkOnline() {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected !== false && s.isInternetReachable !== false;
  } catch (_) {
    return true; // fail open — never block a real user because the probe failed
  }
}

/** React binding. Re-renders only when connectivity actually flips. */
export function useIsOnline() {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    const fn = (s) => setOnline(s.isConnected && s.isInternetReachable);
    _listeners.add(fn);
    setOnline(isOnline());
    return () => _listeners.delete(fn);
  }, []);
  return online;
}
