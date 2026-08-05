// Crash reporting.
//
// The app catches a lot and reports nothing — 231 empty `catch {}` blocks, plus
// 13 ErrorBoundary mounts in App.js that contain a crash locally and tell no
// one. That's fine until it isn't: without this, the first signal that 1.4.0
// crashes on some device is a one-star review.
//
// Sentry stays OFF until a DSN is present, so this file is inert on a machine
// or a build that hasn't been given one. Set it in EAS:
//
//   eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value https://…@…ingest.sentry.io/… --visibility plaintext
//
// or drop it in a local `.env`. `EXPO_PUBLIC_` is required — anything without
// that prefix is stripped from the client bundle.
//
// NOTE: @sentry/react-native has a native module, so enabling it for the first
// time needs a new native build. It is a no-op over OTA until that ships.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

export const crashReportingEnabled = !!DSN;

export function initCrashReporting() {
  if (!crashReportingEnabled) return;
  try {
    Sentry.init({
      dsn: DSN,
      // Errors only by default. Performance tracing on a manga reader that
      // scrolls hundreds of images would be mostly noise and quota burn.
      tracesSampleRate: 0,
      // Breadcrumbs make the swallowed-error problem legible: you get the
      // trail of navigation and network calls that led to a crash.
      enableAutoSessionTracking: true,
      // OTA means the JS in a given native build changes underneath it. Tag
      // the update so a stack trace maps to the bundle that actually ran.
      dist: Constants.expoConfig?.version || undefined,
      environment: __DEV__ ? 'development' : 'production',
    });
  } catch (e) {
    console.warn('[crash] Sentry init failed', e);
  }
}

/**
 * Report a caught error without changing control flow.
 *
 * Use this in place of a bare `catch {}` wherever the failure is one you'd
 * actually want to know about — a failed write, a broken reader page, a
 * profile that won't load. Deliberately ignorable failures (haptics on a
 * device without a motor) should stay silent.
 *
 * @param {unknown} error  the caught error
 * @param {string}  where  a stable label, e.g. 'reader.loadPages'
 * @param {object}  [extra] any serialisable context worth having in the report
 */
export function reportError(error, where, extra) {
  if (__DEV__) console.warn(`[${where}]`, error, extra ?? '');
  if (!crashReportingEnabled) return;
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { where },
      extra,
    });
  } catch (_) {
    // Reporting the reporter failing helps no one.
  }
}

/** Attach the signed-in user to subsequent reports (or clear it on sign-out). */
export function setCrashUser(userId) {
  if (!crashReportingEnabled) return;
  try {
    Sentry.setUser(userId ? { id: userId } : null);
  } catch (_) {}
}
