import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { showAppAlert } from './appAlert';

// Every photo-picker call site used to just call launchImageLibraryAsync()
// directly and silently do nothing if the OS permission was permanently
// denied (canAskAgain: false means the system won't re-prompt — the launch
// call just no-ops). This centralizes the check so a denied user gets a real
// path to fix it instead of a dead tap.
export async function ensureMediaLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return requested.granted;
  }
  showAppAlert(
    'Photo access needed',
    'MangaRecs needs permission to access your photos. Enable it in Settings to continue.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
  return false;
}
