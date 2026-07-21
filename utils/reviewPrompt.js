import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAppAlert } from './appAlert';

// Deep-links straight to the store review page instead of using
// expo-store-review's native in-app sheet — that package needs a new native
// module, which would shift the project's runtime fingerprint and silently
// break OTA delivery for every already-installed build (same issue as
// Reanimated/Apple Sign-In). This trades the native review sheet for a plain
// Linking.openURL, which is pure JS and OTA-safe.
//
// IOS_APP_STORE_ID must be filled in once the app exists in App Store Connect
// (see eas.json's ascAppId, currently also a placeholder) — until then the
// prompt is skipped entirely on iOS rather than opening a broken link.
const IOS_APP_STORE_ID = null;
const ANDROID_PACKAGE = 'com.mangarecs.app';

const ASKED_KEY = '@mangarecs/review_prompted_at';
const COOLDOWN_DAYS = 120;

function storeUrl() {
  if (Platform.OS === 'android') {
    return `market://details?id=${ANDROID_PACKAGE}`;
  }
  if (Platform.OS === 'ios' && IOS_APP_STORE_ID) {
    return `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`;
  }
  return null;
}

// Call at a positive moment (finishing a series, a high-tier badge unlock).
// Silently no-ops if already asked within the cooldown window, or if the
// store URL isn't resolvable yet (iOS pre-launch). Shows an in-app confirm
// first — jumping straight to the store with no warning would feel like the
// app misbehaving, not an invitation.
export async function maybeAskForReview() {
  const url = storeUrl();
  if (!url) return;

  const lastAsked = await AsyncStorage.getItem(ASKED_KEY);
  if (lastAsked) {
    const daysSince = (Date.now() - Number(lastAsked)) / (1000 * 60 * 60 * 24);
    if (daysSince < COOLDOWN_DAYS) return;
  }
  await AsyncStorage.setItem(ASKED_KEY, String(Date.now()));

  showAppAlert(
    'Enjoying MangaRecs?',
    "A quick rating helps other readers find us — takes 10 seconds.",
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Rate MangaRecs', onPress: () => Linking.openURL(url).catch(() => {}) },
    ]
  );
}
