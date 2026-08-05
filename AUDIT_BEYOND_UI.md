# MangaRecs — Audit Beyond UI · 2026-07-30

Companion to [UI_AUDIT.md](UI_AUDIT.md). This covers security, data, reliability, release
readiness, and product instrumentation. Findings are ordered by how much damage they do.

Severity: **P0** fix before launch · **P1** hurts real users now · **P2** will hurt at scale · **P3** hygiene

---

## A. Security

### A1. Every user's push token is world-readable · **P0**

`supabase_migrations.sql:483`:

```sql
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);
```

`profiles` contains `push_token` (line 68). There is no column-level `GRANT SELECT`, no restricted
view, and no `REVOKE SELECT`. The anon key ships inside the app binary, so anyone who extracts it can
run `select push_token from profiles` and harvest **every Expo push token you have**. Expo's push API
accepts a token without proving ownership, so that's arbitrary push notifications to your whole user
base — phishing, spam, or worse, from what users see as your app.

This isn't theoretical: [FriendProfileScreen.js:138](screens/FriendProfileScreen.js#L138) does
`.select('*')` on another user's profile, so the app already pulls other people's push tokens onto
the device on every profile visit.

**The column can't simply be locked — the architecture currently depends on it being readable.**
`utils/pushNotifications.js` sends pushes *from the client*: `sendDMPush` (line 136),
`sendCommentPush` (line 112), and `sendFriendRequestPush` (line 153) each read the **recipient's**
`push_token` on the device and POST straight to `exp.host`. Revoking the column breaks all three.

Two things follow from that, and the second is arguably worse than the leak:

**A1a. `notification_prefs` is enforced client-side.** Every sender does
`if (prof?.notification_prefs?.directMessages === false) return;` *on the sending device*. That is not
a privacy control — it's a suggestion. Anyone with a harvested token calls Expo's API directly and
pushes to users who explicitly turned notifications off.

**The fix is the pattern you already built.** `supabase/functions/chapter-push/index.ts` does this
correctly today: it reads `push_token` server-side with `SUPABASE_SERVICE_ROLE_KEY` (line 9), filters,
and posts to `exp.host` (line 83). `service_role` bypasses RLS *and* column grants, so it keeps
working after lockdown.

**Why not just lock the column.** Two obvious fixes both fail here:

- *RLS* filters **rows**, not columns — and these rows have to stay publicly visible for profile
  browsing to work at all.
- *Column-level `GRANT SELECT`* isn't **row-aware** — revoking `push_token` hides it from its owner
  too, breaking the user's own Settings and registration.

So the private fields move out of the public row instead. **Implemented** — `user_push_settings`
(`user_id` PK, `push_token`, `notification_prefs`), RLS restricted to `auth.uid() = user_id`, with
`profiles` going back to holding only what's safe to show the world. Server senders use `service_role`,
which bypasses RLS, so they read it directly. Client browsing code is untouched — no join changes, no
`profiles!…` embed rewrites.

**Deploy order is load-bearing.** Migration 62 drops the old columns; anything still reading them gets
a 400:

1. `supabase functions deploy notify-user` — plus redeploy `chapter-push`, `report-alert`, and
   `streak-reminder`, which now read the new table.
2. Ship the client (`pushNotifications.js`, `badgeEngine.js`, `SettingsScreen.js`). This is a JS-only
   change, so OTA is fine.
3. **Only then** run migration 62. It backfills before dropping, so no registration or opt-out is lost.

Running step 3 first takes push notifications down until the client catches up.

### A2. Behavioural data is public too · **P1**

Same policy exposes `daily_log` (per-day reading history), `genre_weights`, `notification_prefs`,
`default_site`, `mal_username`, and `anilist_username`. None are needed to render a public profile.
`daily_log` in particular is a detailed behavioural fingerprint — when someone reads, how often, how
long. The A1 grant list above already excludes all of these.

### A3. `.gitignore` doesn't cover a plain `.env` · **P2**

Line 34 ignores `.env*.local` only. A `.env` or `.env.production` would be committed. No such file
exists today — this is about the next one. Add `.env` and `.env.*` with a `!.env.example` exception.

**Confirmed clean:** no `service_role` key anywhere in the tree (only SQL comments and policy bodies),
the anon key is a `sb_publishable_…` key which is designed to be public, and all 24 tables have RLS
enabled with 71 policies. The write path is genuinely well thought through — A1 is a gap in an
otherwise careful model, not carelessness.

---

## B. Release blockers

### B1. The app requests microphone permission and never records · **P0** — *fixed*

`app.json` declared `android.permission.RECORD_AUDIO`. Nothing in the codebase records:
`utils/ambiencePlayer.js` only calls `createAudioPlayer` / `setAudioModeAsync`, and there is no
`useAudioRecorder`, `Recording`, or `requestRecordingPermissions` anywhere.

It came from the `expo-audio` config plugin, which adds `RECORD_AUDIO` by default. The cost: the Play
Store listing displays a **Microphone** permission on a manga reading app. That is an install-conversion
killer and an awkward Data Safety declaration.

**Fixed** — per the [SDK 54 expo-audio docs](https://docs.expo.dev/versions/v54.0.0/sdk/audio/):

```json
["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false }]
```

and dropped `RECORD_AUDIO` from `android.permissions`. **Requires a new native build** — this cannot
ship over OTA.

### B2. `UIBackgroundModes: ["audio"]` is declared but non-functional · **P1** — *needs your call*

`app.json` declares the iOS background audio capability. But `ambiencePlayer.js:40` has your own
comment saying expo-audio v1.x has no `shouldPlayInBackground` — so background playback isn't
implemented and can't currently work.

Declaring a background mode the app doesn't use is a named App Store rejection reason
(Guideline 2.5.4). Two options, and it's a product decision, so I left it alone:

- Ambience is foreground-only → remove `UIBackgroundModes` entirely.
- Ambience *should* survive a screen lock while reading → keep it and actually implement it.

### B3. No crash reporting · **P1**

No Sentry, Bugsnag, or equivalent in `package.json`. When 1.3.1 hits the store you will have zero
visibility into crashes — you'll learn about them from reviews. `ErrorBoundary` is used 13× in
`App.js`, which is good containment, but it swallows the error locally and reports it nowhere.

### B4. No analytics · **P2**

No instrumentation of the onboarding funnel. You can't answer "how many people finish signup", "where
do they drop", or "does anyone use Recap". You're about to launch a social app with no way to tell
whether the social features are being used.

---

## C. Data layer and scale

### C1. There is no pagination anywhere in the app · **P1**

Across `screens/` and `utils/`:

| | count |
|---|---|
| Supabase queries (`.from(`) | 172 |
| with `.limit(` | 21 |
| with `.range(` | **0** |

Feed, DMs, comments, notifications, and activity all fetch unbounded result sets. This is invisible at
launch scale and becomes the app's defining problem as soon as any thread gets popular or any DM
conversation gets long. It compounds every list issue in the UI audit — §3.3 there (DM has no
`onEndReached`) is the same root cause.

`.range(from, to)` is the Supabase idiom; pair it with the inverted DM list from UI_AUDIT §3.1, since
inverting makes "load older on scroll-up" natural.

### C2. `select('*')` where columns should be explicit · **P2**

Four sites: `FriendProfileScreen.js:138`, `ProfileContext.js:85`, `DMScreen.js`,
`CreatorDashboardScreen.js`. The first is the A1 leak. The others over-fetch on every profile load.

### C3. No network-connectivity awareness · **P2**

No `@react-native-community/netinfo`, no `isConnected` check. Every failure — airplane mode, dead
Wi-Fi, Supabase outage, RLS denial — is indistinguishable to the user, and mostly surfaces as nothing
at all (see C4). `FeedScreen` caches an offline snapshot but can't tell the user *why* they're seeing
stale data.

### C4. Errors are swallowed at scale · **P2**

Empty `catch` blocks: `ReaderScreen` 17, `libraryBadges` 13, `FeedScreen` 10, `haptics` 8,
`RecapScreen` 8, `LibraryScreen` 7. Some are legitimate (haptics failing is genuinely ignorable), but
in the reader and feed this means a user experiencing repeated failures sees a blank screen and you
get no signal. This is what makes B3 urgent — errors are being caught and discarded, not surfaced.

---

## D. Testing

### D1. There are no tests of any kind · **P1**

No `jest`, no `test` script, no `__tests__`, no Detox/Maestro. 32,000 lines across 43 screens and
components, a 3,667-line reader, a badge engine, a recap engine, and a rate-limited social backend —
all verified by hand.

You don't need broad coverage. You need the pure logic that's expensive to verify manually and silent
when wrong:

- `utils/badgeEngine.js` + `utils/badges.js` — award conditions and tier boundaries
- `utils/recapIdentity.js` (472 lines) — reader-identity classification
- `utils/titleValidation.js`, `utils/contentFilter.js` — moderation correctness
- `utils/readerUtils.js` — `localDateKey`, streak/daily-log math (timezone bugs here are brutal and invisible)

`jest-expo` is the SDK 54 preset. Even 30 tests over those five files would catch the class of bug
that silently corrupts user stats.

---

## E. Dependency hygiene

### E1. 19 advisories — but read the detail before panicking · **P3**

`npm audit --omit=dev`: 1 critical, 4 high, 14 moderate. The named packages are `tar` (critical),
`postcss`, `shell-quote`, `js-yaml`, `brace-expansion` — all pulled in through `@expo/cli`,
`@expo/config`, and `@expo/prebuild-config`.

**These are build-toolchain dependencies, not code that ships in your app bundle.** The realistic
threat is a malicious input on your build machine or CI, not user-facing compromise. Don't run
`npm audit fix --force` — it will move Expo packages off the SDK 54 pinned versions and break your
build. These resolve when Expo bumps its own CLI dependencies; upgrading the SDK is the fix.

---

## F. Accessibility not covered in the UI audit

### F1. `allowFontScaling={false}` · **P2**

[LibraryScreen.js:254](screens/LibraryScreen.js#L254) opts one element out of Dynamic Type entirely.
Users who enlarge system text for readability get a fixed-size element.

### F2. No `maxFontSizeMultiplier` anywhere · **P3**

Zero uses app-wide. The opposite risk from F1: at the largest accessibility text sizes, tightly
packed layouts (badge rows, stat tiles, tab labels) will overflow. `maxFontSizeMultiplier` on
constrained text is the standard mitigation — it keeps scaling but caps it.

---

## G. Ordered plan

| # | Fix | Severity | Notes |
|---|---|---|---|
| 1 | ~~`notify-user` + `user_push_settings`~~ | **P0** | ✅ code written — **deploy in the §A1 order** |
| 2 | ~~Remove `RECORD_AUDIO`~~ | **P0** | ✅ done — needs a native rebuild |
| 3 | Decide `UIBackgroundModes` | P1 | Product call, then remove or implement |
| 4 | Add crash reporting | P1 | Before store submission |
| 5 | Pagination (`.range`) on feed, DMs, comments, notifications | P1 | With UI_AUDIT §3.1 |
| 6 | Tests on badge/recap/date-math utils | P1 | `jest-expo` |
| 7 | NetInfo + a real offline state | P2 | Makes C4 visible |
| 8 | Analytics on the onboarding funnel | P2 | |
| 9 | Audit empty `catch` blocks in reader + feed | P2 | Report, don't swallow |
| 10 | `.gitignore` `.env` | P2 | |
| 11 | Font-scaling fixes (F1, F2) | P3 | |
