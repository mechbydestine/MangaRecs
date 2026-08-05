import { registerRootComponent } from 'expo';

// Before App, so a crash during module evaluation of the app tree is still
// caught. No-ops unless EXPO_PUBLIC_SENTRY_DSN is set.
import { initCrashReporting } from './utils/crashReporting';

initCrashReporting();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
