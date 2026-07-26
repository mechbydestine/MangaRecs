import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { THEME_STORAGE_KEY } from './ThemeContext';

// Regular sign-out only ever cleared the badge cache — every other cached key
// (favorites, avatar/banner, reading history/resume, notification prefs,
// reader settings, "last read" streak date, etc.) survived on-device. Signing
// into a *different* account on the same device then inherited all of it —
// worst case, ProfileScreen's "seed cloud favorites from local storage if the
// cloud is empty" logic would push the OLD account's favorites straight onto
// the NEW account's profile. Wipe everything (matches the existing
// delete-account precedent) so a fresh sign-in always starts from a clean
// slate and re-syncs purely from its own server data.
export async function clearAllLocalDataAndSignOut() {
  let theme = null;
  try { theme = await AsyncStorage.getItem(THEME_STORAGE_KEY); } catch (_) {}
  try { await AsyncStorage.clear(); } catch (_) {}
  // Theme is a device preference, not account data — safe (and friendlier)
  // to carry across a sign-out on the same device.
  if (theme) { try { await AsyncStorage.setItem(THEME_STORAGE_KEY, theme); } catch (_) {} }
  await supabase.auth.signOut();
}
