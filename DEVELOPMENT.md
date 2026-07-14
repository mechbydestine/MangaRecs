# Developing MangaRecs

## Tech stack

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) / React Native 0.81
- React Navigation (bottom tabs + native stacks)
- [Supabase](https://supabase.com/) for auth, database, and realtime
- React Query for data fetching/caching

## Running it locally

```bash
npm install
npx expo start
```

Then press `a` for Android, `i` for iOS, or scan the QR code with Expo Go.

## Building your own APK

```bash
npx eas-cli build --platform android --profile preview
```

This uses the `preview` profile in `eas.json`, which produces a directly-installable `.apk` (as opposed to the Play Store `.aab` bundle used by the `production` profile).

> To cut a new release after a future build: `npx eas-cli build --platform android --profile preview`, then `gh release create <tag> <path-to-apk>#MangaRecs.apk` and update the download link in `README.md`.

iOS builds aren't sideloadable the same way; if you want on-device iOS access, ask the owner for a TestFlight invite.

## Pushing live updates (no reinstall)

Installed APKs built with `expo-updates` (anything from `v1.2.0-preview` onward) poll for JS/asset-only updates on every cold start and apply them automatically — no new APK needed. To publish one:

```bash
npx eas-cli update --branch preview --message "what changed"
```

Use `--branch production` for the production channel. This only works for JS/asset changes — anything that touches native code or config (new native module, permission, `app.json` native fields) still needs a full `eas-cli build` and reinstall, because the update has to be compatible with the native `runtimeVersion` already baked into the installed APK.

## Versioning

Bump `"version"` in `app.json` before **every** push — OTA update or full rebuild alike (1.1.0 → 1.2.0 → …). It's shown as the App Version in Settings, so it's the one place to look to confirm which build/update someone's actually running.

This is safe to do on every OTA push because `runtimeVersion` uses the `"fingerprint"` policy, not `"appVersion"` — compatibility between an installed APK and a published update is decided by a hash of the native project (code, config, dependencies), not by the version string. So the version number can climb freely on JS-only updates without ever breaking which updates a given APK is eligible for. It only changes when something that actually affects the native build changes — which is exactly when a real rebuild is needed anyway.

See `fingerprint.config.js` for two non-obvious fixes this required: `@expo/fingerprint` hashes the whole app.json by default (version field included, defeating the point above, hence `sourceSkips`), and EAS Build's remote worker runs `expo prebuild` before fingerprinting while the local pre-upload check doesn't, so the generated `android/`/`ios/` dirs only exist on one side unless `ignorePaths` excludes them. Without both, `eas build` fails outright with a runtime-version mismatch error.
