# MangaRecs — Completeness Review

**Date:** 2026-08-21 (second pass) · **App:** v1.5.0 · **Site:** mangarecs.net
**Companion to:** [LAUNCH_REVIEW.md](LAUNCH_REVIEW.md) — that doc holds the "looks AI" analysis and the
original 35-item fix list. This one is the per-area completeness score and what each area needs to reach 100%.

**Verified state after this pass:**

| Check | Result |
|---|---|
| `npx jest` | 165 / 165 pass, 11 suites |
| `npm run check:i18n` | 575 keys × 6 languages, 0 missing |
| `scripts/check-hardcoded-strings.js` | 62 → **17**, and all 17 are brand wordmarks |
| `scripts/check-t-scope.js` (new) | 769 call sites, 0 out of scope |
| `scripts/check-a11y.js` | 189 touchables, **0** missing a label |
| `scripts/check-contrast.js` | 45 pairs, **0** below WCAG AA |

---

## Fixed in this pass

### Localisation — the big one

`check-i18n` was passing while the app still showed English, because it only validates the keys the app
*already asks for*. It is blind to a literal that never went through `t()`. There were **129**.

| | Before | After |
|---|---|---|
| Hardcoded user-visible English | 129 | **17** (all brand wordmarks) |
| Untranslated accessibility labels | 65 | **0** |
| Translation keys in use | 439 | **575** |
| Languages fully covered | 6 | 6 |

**40 of those were free** — the keys already existed in all six languages and were simply never wired
up. `profile.chaptersRead` / `timeRead` / `favGenre` are the three stat cards on the Profile tab.
`detail.status` / `demographic` / `year` / `volumes` / `author` / `artist` is the entire info panel on
every series page. Written, translated, never referenced.

**Worst placements, now fixed:**

- **`AuthScreen` placeholders** — "Username or email", "Password (6+ characters)". The first screen a
  new user ever sees, in English, regardless of their language.
- **Five of the app's six confirm dialogs**, including both destructive ones: *Block this user* and
  *Clear cache*. A Japanese user was asked in English to confirm something irreversible.
- **Empty and error states** across DM, For You, Social, Creator, Moderation, Library — the moments a
  user most needs to understand what happened.

### Three crash bugs found and fixed

`scripts/check-t-scope.js` is new, and it earned its place immediately: it caught **three** `t()` calls
with no `t` in any enclosing scope, each a guaranteed white-screen the moment that component rendered.
Two were in `LeaderboardScreen` sub-components that take `colors` as a prop and had no hook of their
own; one was in `MobileHeader`, which is on nearly every screen in the app.

Nothing else catches this class. `check-i18n` resolves the key happily, `check-hardcoded-strings` sees a
`t()` and moves on, the tests don't mount these screens, and grepping "does this file import useT"
passes — because the file *does* import it, just into a different component. An earlier audit hit the
same class in `AuthScreen`.

### An OTA trap I walked into and backed out of

I added two npm scripts for the new checkers. `package.json`'s `scripts` field is hashed into the Expo
runtime fingerprint (`fingerprint.config.js` skips only `ExpoConfigVersions` and the android/ios script
rewrite), so that would have changed the runtime version and made **every subsequent OTA update
unreachable by every installed build** — the exact failure documented in the project's own history.

Reverted. `scripts/check-hardcoded-strings.js` already carries the warning in its header; the new
`check-t-scope.js` now carries it too. Run them directly:

```
node scripts/check-t-scope.js --strict
node scripts/check-hardcoded-strings.js --strict
```

### Other app fixes

- **Pro plan modal** — removed "Ad-supported experience" (Free) and "No ads" (Pro). No ad SDK exists and
  the site's FAQ and privacy policy both say plainly that MangaRecs doesn't run ads; the app modal was
  the one telling users otherwise. All 18 plan strings now translated.
- **"50% OFF" was 37%.** $3.99 × 12 = $47.88 against $29.99. Now derived from the two price constants
  rather than hardcoded, so it can't drift from the prices again.
- **Creator inputs were unbounded.** `series.title`, `series.description` and `chapters.title` are all
  `TEXT` with no `CHECK` constraint and had no `maxLength` — a creator could paste a megabyte into a
  title that renders in every list in the app. Capped at 80 / 500 / 80, matching the existing convention
  (bio 100, comment 500, DM 1000).

### Website fixes

- **Enter now submits the sign-in form.** The account panel builds loose `<input>`s rather than a
  `<form>`, so nothing gave Enter meaning — typing a password and pressing Enter did nothing at all.
  Wired across all three panel states (sign in, reset, recovery).
- **Reset-password errors rendered in the success colour.** A successful request set the message colour
  to accent and never reset it, so the next real error on the same panel read as a success.
- **`user.email` was concatenated into `innerHTML` unescaped.** Now escaped.
- `/badges/` added to `sitemap.xml` (723 entries, structure validated).
- `rel="canonical"` added to `/terms/` and `/privacy/`, which were duplicated at `/terms.html` and
  `/privacy.html` with nothing resolving them.

---

## Completeness by area

### The App

| Area | Score | What's missing for 100% |
|---|---|---|
| **Feature completeness** | **97%** | Creator monetisation is a planned-pricing screen with no purchase path. Tenor GIF key is still the literal placeholder, so GIF search in DMs silently returns nothing. |
| **Localisation** | **99%** | Done, except `LegalScreen`'s privacy/terms bodies, which are hardcoded English constants and are covered by the legal rewrite below. |
| **Accessibility** | **95%** | 0 unlabelled touchables, 0 contrast failures. Remaining: no focus-order testing, no Dynamic Type / font-scaling pass, no reduced-motion honouring in the Recap animations. |
| **Reliability** | **88%** | 165 tests, Sentry wired, NetInfo, ErrorBoundary everywhere. Sentry is still **inert** — `EXPO_PUBLIC_SENTRY_DSN` is unset, so the first sign a build crashes is a one-star review. |
| **Backend / security** | **95%** | RLS in place, push tokens off `profiles`. Open: `launch_notify` and `site_events` accept unauthenticated inserts with no rate limit; the moderation queue is gated on one hardcoded admin UUID. |
| **Performance / scale** | **82%** | Pagination on the unbounded lists. Open: Library grid is unvirtualised (blocked by drag-to-rearrange measuring absolute rects); the DM reaction channel subscribes to *every* reaction in the app and filters client-side. |
| **UI polish** | **94%** | Tab-bar overlap fixed, safe-area and tablet handled. Open: **Profile and For You have no loading state at all** — zero `Skeleton`/`ActivityIndicator` across two of the five tabs, so a cold start shows "0 chapters, 0 badges, no friends" before the data lands. `MangaDetailScreen` has no pull-to-refresh. |
| **Theming** | **90%** | Hardcoded `#7B5CFF` down to 2. Remaining leaks: `StarRating`, `ToastHost`, `BadgeIcon`, `BadgeDetail`, `SourceProbe`, `AuthButtons` have no `useTheme`, so they inherit dark styling inside a Light-theme screen. |
| **Store readiness** | **70%** | No Universal Links / App Links at all. Screenshots are 720×1496 and Android-only. No working support mailbox. Legal docs contradict each other. |

**App overall: ~92%**

### The Website

| Area | Score | What's missing for 100% |
|---|---|---|
| **Marketing pages** (home, features, badges, about) | **93%** | Brand fonts, gradient/glow and copy fixed last pass; Relic Vault added. Open: screenshots are soft, maker note unsigned, demo cards still show fabricated match percentages. |
| **Catalog SPA** | **90%** | Works, searchable, syncs. No `i18n.js`, so English-only. |
| **Catalog title pages (712)** | **55%** | **393 still show a synopsis chopped mid-word with no ellipsis.** No theme persistence, no analytics, no topnav, no related-titles grid (its CSS ships on every page unused), no i18n, no hreflang. Must be fixed in `scripts/generateCatalogPages.mjs`, not the output. |
| **Legal pages** | **45%** | See below. |
| **SEO** | **85%** | Sitemap and canonicals fixed. Open: no OG tags on about/terms/privacy; `hreflang` only on the homepage; 716 sitemap entries still say `lastmod 2026-07-26`. |
| **i18n** | **35%** | Only the homepage is translated. `features/` and `badges/` *load* `i18n.js` — so the language switcher appears — but contain **zero** `data-i18n` attributes, so switching language does nothing. That is worse than not offering it. |
| **Accessibility** | **88%** | Account panel still has no focus trap or `aria-expanded`, unlike the nav drawer beside it. |

**Website overall: ~78%**, dragged down almost entirely by the 712 catalog pages.

### Legal — **45%**, and the lowest score on the board

Unchanged from the last pass and still launch-blocking:

- App says contact is `support@mangarecs.net`; site says `hello@mangarecs.net` in 8 files with a
  `TODO: confirm real support address` still sitting in 6 of them. **Neither mailbox exists yet.**
- App says content comes from the **MangaDex API**; site says **AniList**. The app uses both, and 476
  catalog pages hotlink covers from MangaDex while the terms claim AniList.
- App terms say "old enough under the laws of your country"; site says 13+.
- Neither policy discloses **Sentry** (which attaches the signed-in user id), the **AniList/MAL import**,
  or **MangaDex**.
- Neither has a **DMCA process**, governing law, controller identity, GDPR/CCPA rights, retention
  schedule, liability cap, or any creator agreement.
- The app's legal screen is hardcoded English while the app speaks six languages.

---

## What still needs doing, ranked

### Blocked on you

1. **Create `support@mangarecs.net`.** Blocks store submission and the legal rewrite.
2. **Register a DMCA agent** with the US Copyright Office (~$6). For a manga app this is the single most
   important protection you don't have.
3. **Re-shoot screenshots** at ≥1080px wide, including real iOS captures.
4. **A name for the maker note.** Best copy on the site, currently anonymous.
5. **Your US state**, for the governing-law clause.

### P0 — I can do these

| # | Fix |
|---|---|
| 1 | Rewrite Privacy + Terms + creator agreement from one source rendering to both site and app |
| 2 | Fix `generateCatalogPages.mjs`: word-boundary truncation, theme script, analytics, topnav, related titles — then regenerate all 712 |
| 3 | Verify `migration67_site_analytics.sql` actually ran, or the waitlist is still failing silently |
| 4 | Set `EXPO_PUBLIC_SENTRY_DSN` in EAS so crash reporting stops being inert |

### P1

| # | Fix |
|---|---|
| 5 | Universal Links + App Links (`.well-known/` × 2, `app.json`) — **needs a native rebuild** |
| 6 | Loading states on Profile and For You (`components/Skeleton.js` already exists) |
| 7 | Translate `features/` and `badges/`, or hide the switcher there |
| 8 | Serve catalog covers from own storage, or correct the AniList claim in the terms |
| 9 | Rate-limit `launch_notify` and `site_events` |

### P2

| # | Fix |
|---|---|
| 10 | `useTheme` in the six leaking components |
| 11 | Filter the DM reaction realtime subscription |
| 12 | Pull-to-refresh on `MangaDetailScreen` |
| 13 | OG tags on about/terms/privacy; hreflang beyond the homepage; refresh sitemap `lastmod` |
| 14 | Focus trap + `aria-expanded` on the site's account panel |
| 15 | Dynamic Type / font-scaling pass on the app |
| 16 | Moderation queue off the hardcoded admin UUID |
| 17 | Tenor API key, or remove the GIF picker |

---

## Honest summary

The app is close. 92% is real: every button is wired, nothing is stubbed, the tests pass, accessibility
and contrast are clean, and localisation is now genuinely complete rather than nominally complete.

Two things stand between it and shipping, and neither is code quality:

- **The legal surface (45%)** is the actual blocker. Two contradictory policies, no DMCA process, and a
  support address that doesn't exist.
- **The catalog's 712 pages (55%)** are 98.6% of your site and the pages Google will index. 393 of them
  display a sentence that stops mid-word.

Everything else on this list is polish by comparison.
