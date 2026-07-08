<div align="center">

<img src="./assets/icon.png" width="96" height="96" alt="MangaRecs icon" />

# MangaRecs

**Your next story, recommended.**

A social manga & manhwa reader — track your library, get AI-powered recommendations, and talk about what you're reading with friends.

[![Download APK](https://img.shields.io/badge/Download-APK-7B5CFF?style=for-the-badge&logo=android&logoColor=white)](https://expo.dev/accounts/kazymodo/projects/inklore/builds)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20iPadOS-444?style=for-the-badge)]()

</div>

---

## Download

Grab the latest Android build from the **[EAS builds page](https://expo.dev/accounts/kazymodo/projects/inklore/builds)** — open the most recent successful `preview` build and tap **Download**, then install the `.apk` directly on your phone or tablet (you'll need to allow installs from unknown sources the first time).

> Build artifacts expire after about 30 days on this plan. If the latest one is gone, run `npx eas-cli build --platform android --profile preview` to cut a fresh one (see below).

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
