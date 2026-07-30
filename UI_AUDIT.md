# MangaRecs UI / UX Audit — 2026-07-30

Cross-referenced against Discord, Instagram, TikTok, Webtoon, Mangapin, and Tachiyomi-family readers.

**Research note:** Mobbin MCP is registered (`https://api.mobbin.com/mcp`, user scope) but MCP access
requires a Pro/Team plan — the free tier can't authenticate it. Everything below comes from direct
code audit plus published pattern knowledge of the reference apps. If the plan is upgraded later,
the open questions in §6 are the ones worth pulling real reference screens for.

Severity: **P0** ships-broken · **P1** hurts real users now · **P2** will hurt at scale · **P3** polish

---

## 1. Design system — the root cause of most of the rest

### 1.1 The "Dark" theme barely applies · **P1**

`utils/ThemeContext.js` ships three palettes. Dark's entire differentiator is a muted primary
(`#5B4E8A`) instead of Default's vivid `#7B5CFF`. But:

| | count |
|---|---|
| `colors.primary` (themed) | 58 |
| `#7B5CFF` (hardcoded) | 254 |

**~81% of primary-colour usage bypasses the theme.** A user who picks Dark still sees vivid purple
on nearly every button, tab, badge, and accent. The setting looks broken, not subtle.

Same class of leak for `#1D9E75` (accent) and the neutral ramp (`#9B9AA3` ×39 and `#5C5B63` ×11 in
ReaderScreen alone).

> **Careful:** not every `#7B5CFF` is the app primary. `SocialScreen.js:51` uses it as the `default`
> entry in a `THEME_COLORS` profile-colour map — that one is user-facing content, not chrome, and
> must stay literal. A blind find-replace breaks profile themes.

### 1.2 No token layer · **P2**

Colours, spacing, radii, and type scale are inline `StyleSheet` literals in all 43 screen/component
files. There is no `theme.js` / `tokens.js`. This is *why* 1.1 happened and why it will happen again
with every new screen.

Discord, Instagram, and Webtoon all ship a token layer precisely because hand-carried hex values
don't survive a second theme. You added a third palette; the codebase wasn't ready for it.

### 1.3 Files with no `useTheme` at all

```
screens/IntroScreen.js          components/RecapCompareModal.js
screens/RecapScreen.js          components/RecapExportCard.js
components/AuthButtons.js       components/RecapStage.js
components/BadgeCeremony.js     components/StarLogo.js
components/BadgeDetail.js       components/StarRating.js
components/BadgeIcon.js         components/ToastHost.js
components/CoverMorphOverlay.js components/GoogleLogo.js
```

Recap/Intro are deliberately art-directed surfaces — fine to opt out. But `StarRating`, `BadgeIcon`,
and `ToastHost` render *inside* themed screens, so they're genuine leaks: a toast in Light theme
inherits dark-theme styling.

---

## 2. Performance and scale

### 2.1 The manga reader has no image disk cache · **P1 — highest single-impact fix**

`expo-image@~3.0.11` is already a dependency and already used in `FeedScreen`, `DMScreen`,
`RecapScreen`, `CoverMorphOverlay`, `RecapStage`, `RecapExportCard`, and `mangaCovers.js`.

But these still use React Native's built-in `Image`:

> **Correction (post-review):** the library *cover grid* is fine — it renders through `MangaCover`
> in [mangaCovers.js:420](utils/mangaCovers.js#L420), which already uses expo-image with
> `cachePolicy="disk"`. `LibraryScreen`'s own RN `Image` is only the small site favicon. The reader
> is the real gap; the grid is not.

```
screens/ReaderScreen.js        ← full-resolution manga pages, dozens per chapter
screens/LibraryScreen.js       ← site favicon only (covers go through MangaCover)
screens/MangaDetailScreen.js
screens/ProfileScreen.js
screens/SocialScreen.js
screens/FriendProfileScreen.js
screens/DiscussionScreen.js
screens/NotificationsScreen.js
screens/CreatorDashboardScreen.js
components/BadgeIcon.js
```

RN's `Image` has weak-to-absent disk caching on Android. The reader re-downloads pages on every
revisit and burns mobile data — the exact thing Tachiyomi-family readers optimise hardest. The
reader already does smart next-chapter prefetch (`ReaderScreen.js:2077-2081`); that prefetch is
partly wasted without a real cache behind it.

**Not a blind swap.** `expo-image` doesn't support `defaultSource` (`ReaderScreen.js:1073`), and
`onLoadEnd` / `onLoad` payload shapes differ (`ReaderScreen.js:2687`). Do Library and MangaDetail
first — simpler surfaces, immediate win — then the reader deliberately.

### 2.2 The library renders every series at once · **P2**

[LibraryScreen.js:1341](screens/LibraryScreen.js#L1341) — `filtered.map(...)` inside a plain
`ScrollView`. No virtualization. A 500-series library mounts 500 `GridItem`s with 500 cover images.

Worse, the key is `` `${focusKey}-${activeTab}-${series.id}` `` — **every focus change remounts every
item in the grid**, re-triggering image loads and entry animations.

Same pattern in `SocialScreen`, `DiscussionScreen`, `AllDiscussionsScreen`.

Only 7 screens use `FlatList` at all; `LibraryScreen` and `SocialScreen` have `RefreshControl` bolted
onto a `ScrollView` instead.

---

## 3. DM / chat — measured against Discord & Instagram

### 3.1 The message list isn't inverted · **P1**

[DMScreen.js:857-880](screens/DMScreen.js#L857-L880). The list renders oldest→newest with
`onContentSizeChange={null}` explicitly disabled, and compensates with **six** scattered timing hacks:

```
line 453  setTimeout(scrollToEnd, 80)
line 548  setTimeout(scrollToEnd, 80)   // animated: false
line 634  setTimeout(scrollToEnd, 60)
line 697  setTimeout(scrollToEnd, 60)
line 737  setTimeout(scrollToEnd, 60)
line 788  setTimeout(scrollToEnd, 60)
```

Every serious chat app — Discord, Instagram DMs, iMessage, WhatsApp — uses an **inverted** list, where
"newest at bottom" is the natural resting state and needs no scrolling at all. The timeout approach
visibly jumps on open, and loses the race whenever a message contains an image or a quoted reply that
changes height after layout. 60ms is a guess that fails on cold starts and low-end Android.

This also blocks §3.3.

### 3.2 Hardcoded keyboard offset · **P2**

[DMScreen.js:838](screens/DMScreen.js#L838) — `keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}`.
88 is a magic number for one specific header height. It's wrong on Dynamic Island devices, wrong on
iPad, and `0` on Android is wrong whenever `windowSoftInputMode` isn't `adjustResize`. Derive it from
`useHeaderHeight()` / `useSafeAreaInsets()`.

### 3.3 No message pagination · **P2**

No `onEndReached` in `DMScreen`. Long conversations load in full. Inverting the list (§3.1) makes
"load older on scroll-up" the natural, correct implementation.

---

## 4. Accessibility — the weakest area of the app

Roughly **700 touchables app-wide, ~60 accessibility labels.**

| Screen | Touchables | a11y labels |
|---|---|---|
| ReaderScreen | 124 | 10 |
| FeedScreen | 77 | 9 |
| **ProfileScreen** | **73** | **0** |
| SocialScreen | 67 | 7 |
| SettingsScreen | 65 | 8 |
| LibraryScreen | 50 | 4 |
| **DiscussionScreen** | **47** | **0** |
| DMScreen | 37 | 11 |
| **FriendProfileScreen** | **31** | **0** |
| **AuthScreen** | **21** | **0** |
| **OnboardingScreen** | **21** | **0** |
| **ForYouScreen** | **13** | **0** |

`AuthScreen` and `OnboardingScreen` at zero is the worst of these — a screen reader user cannot
complete signup. That's an App Store accessibility-review risk, not just polish.

**Tap targets:** 259 icons render at ≤18px. Only `ProfileScreen` and `SocialScreen` declare a 44pt
minimum anywhere. `hitSlop` appears in 23 files but sparsely (1–6 uses each). Apple HIG and Material
both require 44pt / 48dp.

---

## 5. Missing states & interaction gaps

### 5.1 Pull-to-refresh absent where users expect it · **P2**

Present: Feed, ForYou, Library, Social. **Absent:** DM, Notifications, Profile, FriendProfile,
Discussion, AllDiscussions. Pull-to-refresh on a notification list is a universal expectation.

### 5.2 Only 3 `ListEmptyComponent` in the app · **P3**

Feed, Notifications, Reader. Library handles empties with hand-rolled conditionals
([LibraryScreen.js:1330-1338](screens/LibraryScreen.js#L1330-L1338)) — works, but the pattern isn't
shared, so each new list re-invents it or ships blank.

### 5.3 Interaction affordances the reference apps have and we don't · **P3**

- **No double-tap-to-like on Feed.** Instagram and TikTok baseline; costs nothing, and the
  optimistic like state already exists (`FeedScreen.js:1183`).
- **No long-press reaction picker on Feed posts or Discussion comments.** Discord's core gesture.
  Already implemented in `DMScreen` and `SocialScreen` — so the component exists, it's just not reused.
- **No swipe-to-reply on Discussion comments** — `DMScreen` has `SwipeableMessageRow` already built.

The theme here: **social gestures were built once in DM and never propagated.** That's cheap to fix
and makes the app feel consistent rather than half-finished.

---

## 6. Future problems worth pre-empting

1. **A fourth theme (or per-profile themes) will be near-impossible.** `profileThemes.js` already
   exists alongside `ThemeContext`, so there are two colour systems in play. Until §1.2 lands, every
   new palette needs 254 manual edits.

2. **Library performance is a cliff, not a slope.** It's fine at 50 series and unusable at 500. Power
   users — the ones who evangelise the app — hit it first.

3. **The reader is 3,667 lines in one file** with webtoon/paged modes, double-page spreads, pinch-zoom,
   a WebView fallback, ad-blocking, and site resolution all interleaved. It works, but every future
   reader change carries whole-screen regression risk. This is the highest-value refactor target once
   feature work settles.

4. **Offline is half-built.** There's a "Downloaded" tab, but §2.1 means no real image cache layer
   underneath. Deciding the caching story now avoids building download UI twice.

5. **Accessibility debt compounds into a store-review risk.** Signup being unusable with VoiceOver
   is the kind of thing that surfaces at the worst possible moment.

6. **Worth pulling Mobbin references for, if upgraded:** reader chrome auto-hide timing and
   progress-indicator styling (Webtoon vs Mangapin diverge sharply here); onboarding step-count and
   permission-priming order; DM reaction-picker layout.

---

## 7. Recommended order

| # | Fix | Severity | Effort |
|---|---|---|---|
| 1 | `expo-image` on Library + MangaDetail, then Reader | P1 | M |
| 2 | Extract token layer; migrate `#7B5CFF` → `colors.primary` | P1 | M |
| 3 | Invert the DM list, delete the six `setTimeout`s | P1 | M |
| 4 | a11y labels on Auth + Onboarding, then Profile/Discussion | P1 | S |
| 5 | Virtualize the library grid; fix the `focusKey` remount | P2 | M |
| 6 | Derive DM keyboard offset from header height | P2 | S |
| 7 | Pull-to-refresh on the six screens missing it | P2 | S |
| 8 | Propagate double-tap-like / long-press-react / swipe-reply | P3 | S |
| 9 | Shared `EmptyState` component | P3 | S |
