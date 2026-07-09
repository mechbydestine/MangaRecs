<div align="center">

<img src="./assets/icon.png" width="96" height="96" alt="MangaRecs icon" />

# MangaRecs

**Your next story, recommended.**

A social manga & manhwa reader — track your library, get AI-powered recommendations, and talk about what you're reading with friends.

[![Download APK](https://img.shields.io/badge/Download-APK-7B5CFF?style=for-the-badge&logo=android&logoColor=white)](https://github.com/mechbydestine/MangaRecs/releases/download/v1.1.0-preview/MangaRecs.apk)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20iPadOS-444?style=for-the-badge)]()

</div>

---

## Download

**[Download the APK](https://github.com/mechbydestine/MangaRecs/releases/download/v1.1.0-preview/MangaRecs.apk)** — hosted directly on this repo's [Releases](https://github.com/mechbydestine/MangaRecs/releases) page, no Expo account or login needed. Install the `.apk` directly on your phone or tablet (you'll need to allow installs from unknown sources the first time).

> To cut a new release after a future build: `npx eas-cli build --platform android --profile preview`, then `gh release create <tag> <path-to-apk>#MangaRecs.apk` and update this link.

iOS builds aren't sideloadable the same way; if you want on-device iOS access, ask the owner for a TestFlight invite.

## What it does

- **Feed** — a swipeable, TikTok-style stream of manga/manhwa picks with likes, comments, and shares
- **Library** — track what you're reading, completed, bookmarked, or downloaded for offline reading
- **For You** — AI-flavored recommendations tuned to your genre taste profile
- **Comms** — friends, direct messages, discussion threads per series, and a community feed
- **Profile** — stats, a 250-badge achievement system with tiered "relic" rewards, ratings, and a customizable reader theme
- **Reader** — in-app chapter reading with adjustable page animation, dimmer, ambience sounds, and auto-scroll

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

## Pushing live updates (no reinstall)

Installed APKs built with `expo-updates` (anything from `v1.1.0-preview` onward) poll for JS/asset-only updates on every cold start and apply them automatically — no new APK needed. To publish one:

```bash
npx eas-cli update --branch preview --message "what changed"
```

Use `--branch production` for the production channel. This only works for JS/asset changes — anything that touches native code or config (new native module, permission, `app.json` native fields) still needs a full `eas-cli build` and reinstall, because the update has to be compatible with the native `runtimeVersion` already baked into the installed APK.

## Versioning

Bump `"version"` in `app.json` before **every** push — OTA update or full rebuild alike (1.1.0 → 1.2.0 → …). It's shown as the App Version in Settings, so it's the one place to look to confirm which build/update someone's actually running.

This is safe to do on every OTA push because `runtimeVersion` uses the `"fingerprint"` policy, not `"appVersion"` — compatibility between an installed APK and a published update is decided by a hash of the native project (code, config, dependencies), not by the version string. So the version number can climb freely on JS-only updates without ever breaking which updates a given APK is eligible for. It only changes when something that actually affects the native build changes — which is exactly when a real rebuild is needed anyway.
