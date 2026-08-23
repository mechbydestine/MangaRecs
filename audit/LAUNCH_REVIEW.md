# MangaRecs — Pre-Launch Review

**Date:** 2026-08-21 · **App version:** 1.5.0 · **Site:** mangarecs.net (GitHub Pages, `/docs`)
**Scope:** every app screen, every website page, both legal surfaces.
**Method:** direct code audit + the full test suite (165 tests, 11 suites — all green) + `check:i18n` (439 keys × 6 languages — all resolve).

Severity: **P0** blocks launch · **P1** hurts users on day one · **P2** hurts at scale · **P3** polish

---

## Fixed in this pass (2026-08-21)

The "it looks AI" bucket is done. Everything below is applied and verified:

| # | Fix | Result |
|---|---|---|
| 7 | `fonts.css` now loads on about / terms / privacy / 404 | 4 pages no longer render in the OS system font. Headings take the display face. |
| 8 | Hero gradient-clipped headline → solid accent | `background-clip: text` count 1 → **0** (also removed from `404.html`) |
| 8 | Accent-tinted resting glow shadows → neutral | 10 → **0**. Content-derived glows (`--tile-c`, `--fc`, `--tier-c`) deliberately kept — those carry meaning. |
| 9 | Em-dash and negation-contrast copy pass | i18n keys with em-dash **23 → 0**; negation constructions **12 → 1** (`faq.a9`'s "No ads, nothing sold" — a factual list, and legally load-bearing) |
| 17 | **Relic Vault band added to the homepage** | The 15 hand-drawn relics in `assets/badges/relics/` were never shown on the site despite the copy bragging about them. 10 are now on the page at 108 KB total, lazy-loaded, with real names and tier colours read from `badges.js`. |
| 30 | Radius scale | 13 ad-hoc values → **5 tokens** (`--r-xs/sm/md/lg/pill`) in `base.css`, 40 declarations converted, 0 raw px left |
| 31 | Zigzag rhythm broken | The Relic Vault band sits between Progress and Discover, interrupting five mirrored chapter sections in a row |
| 32 | "No mockups" claim dropped | It sat one section above four hardcoded fake match percentages. Now reads "Real screens, pulled straight from the current build." |

**Verification:** `i18n.js` parses; all six languages at 114 keys with 4 relic keys
each; all 112 `data-i18n` fallbacks match their dictionary value; all 9 FAQ answers
still match the FAQPage JSON-LD word-for-word (Google penalises drift); section/div/
p/ul/li tags balanced; all 10 relic files present.

**Not done from Part 1, and why:** the screenshots need re-capturing on your device
(#16), and the maker note needs a name to sign it with (#17) — both need you.

---

## Verdict up front

The app is in genuinely good shape. Every button is wired — I looked for stub `onPress` handlers and dead
CTAs and found **zero**. No uncleaned intervals, no leaked realtime channels, no raw `Alert.alert` bypassing
the themed alert host, versions consistent across `app.json` / `changelog.js` / the site's structured data.
The previous audits did real work.

What is left splits into four buckets, and only one of them is about code:

1. **The site reads as machine-built** — and it does, for reasons I can point at precisely. Fixable in a day.
2. **The catalog is 98.6% of your site and it is second-class.** 712 pages missing theme, analytics, translation, and 395 of them display a synopsis cut off mid-word.
3. **The app's localisation has quietly regressed.** The first screen a user sees is hardcoded English.
4. **The legal docs contradict each other, the app, and the product.** This one is launch-blocking.

---

# Part 1 — "It looks too AI"

Your acquaintances are right, and they are reacting to specific things. The palette is not the problem —
they told you that themselves. Here is what actually triggers it.

## 1.1 The visual tells · **P1**

I counted these on the homepage:

| Tell | Count | Why it reads as AI |
|---|---|---|
| Gradient-filled headline text (`background-clip: text`) | 1 (the hero H1) | The single most recognisable "AI landing page" signature in 2026 |
| Glow shadows tinted with the accent colour | 10 | `box-shadow: 0 8px 20px -8px var(--accent)` on every button |
| `backdrop-filter: blur()` glass surfaces | 5 | Glassmorphism nav |
| Pill buttons (`border-radius: 999px`) | 21 | |
| Gradients total | 17 | |
| Scroll-reveal stagger sections | 11 | |

Plus the structural template: eyebrow → gradient headline → subhead → two CTAs → trust row → alternating
left/right "chapter" sections → stat meters → FAQ accordion → email capture. That is the default shape of
every generated landing page, and people recognise the silhouette before they read a word.

**Fix, in priority order:**

- **Kill the gradient on the H1.** Solid `var(--ink)` with a single word in accent. This one change does
  more than the other five combined.
- **Drop the accent-tinted glow shadows.** Use a neutral shadow (`rgba(0,0,0,0.18)`) or none. Coloured
  glow behind a purple button is the tell.
- **Break the zigzag.** Five "chapter" sections alternate flip / no-flip. Real product sites vary section
  shape: one full-bleed, one three-up, one scroll-driven demo. Right now sections 2 and 4 are the same
  section mirrored.
- **Stop rounding everything to a pill.** You ship 13 distinct radius values (2, 7, 8, 9, 10, 11, 12, 14,
  16, 18, 20, 22, 999px) with no token. Pick three — say 8 / 14 / 999 — put them in `base.css` as
  `--r-sm` / `--r-md` / `--r-pill`, and use only those. Inconsistent corner radii are a subconscious
  "assembled, not designed" signal.

## 1.2 The copy tells · **P1**

The writing is better than most — there is real voice in the maker note. But two habits give it away:

- **51 em-dashes** in the homepage's visible text. Roughly one every two sentences.
- **16 "not X — Y" contrast constructions.** Verbatim from the page: `not just a link, an actual save` ·
  `not a stale "last seen" timestamp` · `not stock icon-pack junk` · `not a progress bar` ·
  `not a genre filter you set once and forget` · `not just a personal streak counter` ·
  `instead of asking you to fill out a genre survey` · `No mockups` · `not a fabricated…`

The negation-contrast reflex is the most recognisable LLM prose habit there is. Once a reader notices the
second one, they see every one after it.

**Fix:** Cap em-dashes at ~10 across the page (commas, colons, full stops, or just two sentences). Keep
**at most three** "not X, Y" constructions — the strongest three — and rewrite the rest as plain
assertions. "Rec a title straight into a friend's library" is stronger than "not just a link, an actual
save," because the second version spends half its words on the competitor.

## 1.3 The credibility tells · **P1**

These are the ones that actually cost you trust:

- **Four pages render in a different typeface.** `about/`, `terms/`, `privacy/`, and `404.html` do not
  load `fonts.css` at all — they fall back to `-apple-system, system-ui, 'Segoe UI'`. Click "About" from
  the homepage and the entire typographic identity changes. Those are precisely the pages meant to earn
  trust. **This is the single most damaging item in Part 1.**
- **The screenshots are low-resolution.** All six are 720×1496 — an Android capture, downscaled. On any
  retina display they are visibly soft. Blurry screenshots read as "not a real app." They are also all
  Android, while the page promises "iOS and Android, at launch."
- **The demo cards show fabricated numbers.** `98% match`, `95% match`, `91% match`, `97% match`,
  hardcoded — sitting one section above the line "No mockups — this is what's actually on your phone."
  Either label the swipe demo as a demo, or drop the fake percentages.
- **"Sample profile"** appears twice as a visible tag (`docs/index.html` lines 970 and 1015). Honest, but
  it tells the reader they are looking at filler. Populate those two cards from the live catalog the way
  the Trending section already does.

## 1.4 What would actually make it feel original

The palette is fine. What is missing is anything that could only come from *this* product:

- **No original artwork anywhere on the site.** You have a Relic Vault of hand-drawn weapon art that the
  copy specifically brags about ("original weapon art we drew ourselves, not stock icon-pack junk") — and
  the site shows none of it. That is your single best anti-AI asset and it is not on the page.
- **No community proof.** No real usernames, no real discussion thread, no real Rec. The Connect section
  uses invented handles (`momo`, `sinomatic`, `yaboish`). One genuine screenshot of a real thread beats
  three fabricated ones.
- **No human.** "Built by readers, for readers" is a claim; a name, a face, or a founder's note with a
  signature is evidence. The maker note is the best copy on the site and it is unsigned.

---

# Part 2 — Website

## 2.1 The catalog is 98.6% of your site and it is second-class · **P0/P1**

712 of the 722 pages are `catalog/title/*`. These are the pages Google will actually index and land people
on. Every one of them is missing things the other 10 pages have:

| Missing | Impact | Severity |
|---|---|---|
| Theme persistence script | Visitor sets Light on the homepage, clicks a title, page flips back to system theme | **P1** |
| `analytics.js` | Your page counter is blind to 98.6% of the site — including all SEO traffic | **P1** |
| `i18n.js` + `hreflang` | Site is translated into six languages; the catalog is English-only | **P2** |
| Topnav (search, account, language, menu) | A visitor landing from Google gets a breadcrumb and a footer. No way to search, no way to sign in | **P1** |
| Related-titles grid | 712 leaf pages with no lateral links. The CSS for `.grid`/`.card` **ships on every page and is never used** | **P2** |

### 2.1.1 395 title pages show a synopsis cut off mid-word · **P0**

This is the worst-looking bug on the whole property. The `<p class="desc">` is hard-truncated at ~300
characters with **nothing appended** — no ellipsis, no closing punctuation. Real examples, verbatim:

> …Seemingly unintelligent, they have roamed the world for years, killing everyone they see. For the past century, **w**

> …two boys come to understand each

> …I'll just pick a sunny **a**

**395 of 712 pages** (55%) end mid-word. The `<meta name="description">` on the same page appends `…`
correctly — so it is specifically the visible body copy that is broken. Anyone who lands from search sees
a page that looks broken, and this is exactly the kind of thing that reads as machine-generated.

**Fix:** truncate on a word boundary and append `…`, or better, do not truncate at all — there is no
layout reason to cap a synopsis at 300 chars in a 66ch measure.

### 2.1.2 476 title pages hotlink covers from MangaDex · **P1**

Cover art on 476 pages loads from `uploads.mangadex.org`; 102 from `s4.anilist.co`. Two problems:

1. **It contradicts your own legal pages.** Terms and About both state catalog metadata — explicitly
   including cover art — comes from AniList's public API. 67% of your covers come from MangaDex.
2. **It is fragile in public.** Those URLs are also your `og:image`, so if MangaDex adds hotlink
   protection you lose covers *and* every social share preview at once. 134 pages already fall back to
   the generic site OG image, meaning their share cards show no cover at all.

## 2.2 The language switcher is a trap on two pages · **P1**

`features/` and `badges/` **load `i18n.js`** — so the language switcher renders — but they contain **zero
`data-i18n` attributes**. A visitor picks 日本語, the switcher confirms, and the page stays 100% English.
That is worse than not offering the language.

`about/`, `terms/`, `privacy/`, `404`, and `catalog/` do not load `i18n.js` at all.

**Only the homepage is actually translated** (108 `data-i18n` bindings, 111 keys × 6 languages, consistent).

## 2.3 Dynamic strings bypass i18n even on the homepage · **P2**

The homepage is translated — until something happens. All of these are hardcoded English:

- Waitlist results (`docs/index.html:1512`): `"You're already on the list."` ·
  `"You're on the list — we'll email you at launch."` · `"Something went wrong — try again in a moment."`
- The entire account panel (`docs/assets/nav-widgets.js`): `Sign in`, `Create account`, `Forgot password?`,
  `Need an account? Sign up`, `Continue with Google`, `Enter an email and password.`,
  `Check your email to confirm your account.`, `Use at least 6 characters.`, `My Profile`, `Sign out`.

So a Japanese visitor gets a translated form and an English confirmation.

## 2.4 Sign-in bugs · **P1**

In `docs/assets/nav-widgets.js`:

- **Enter does not submit.** The email/password inputs are not in a `<form>` and only the button has a
  click handler. Typing a password and hitting Enter does nothing. Every real sign-in form submits on
  Enter — this is a top-tier "feels unfinished" bug.
- **Errors render in the success colour.** `wireForgot()` sets `errEl.style.color = 'var(--accent)'` on
  success and never resets it. Request a reset link (accent-coloured success message), then submit again
  with a bad address — the error renders in the same accent colour, reading as success.
- **`user.email` is injected into `innerHTML` unescaped** in `signedInHtml()`. Supabase constrains email
  shape so exploitability is low, but it is an unnecessary injection surface — use `textContent`.
- **No Escape key, no focus trap, no `aria-expanded`** on the account panel — the nav menu right next to
  it has all three. Inconsistent.
- **No password visibility toggle**, no loading spinner on submit (just `disabled`), no min-length hint
  before the server rejects.

## 2.5 SEO gaps · **P2**

- **`/badges/` is not in `sitemap.xml`.** A 314-line page listing all 250 badges, linked from the homepage,
  invisible to search.
- **`terms/` and `privacy/` have no `rel="canonical"`.** Both are also reachable at `/terms.html` and
  `/privacy.html` — duplicate content with no canonical to resolve it.
- **`about/`, `terms/`, `privacy/` have zero OG/Twitter tags.** Sharing those links produces a bare preview.
- **`hreflang` exists only on the homepage** despite six declared locales.
- **`lastmod` is stale**: 716 of 722 sitemap entries say `2026-07-26`.

## 2.6 Abuse surface on the two anon-write tables · **P2**

`launch_notify` and `site_events` both grant unauthenticated `INSERT` with `with check (true)` and no rate
limiting or CAPTCHA. Someone can flood your waitlist with junk addresses or inflate your page counter
arbitrarily. Add a per-IP rate limit before you promote the site.

Also: **`notifyLaunch()` has no `.catch()`** while `launchNotifyCount()` does. If the insert ever rejects
rather than resolving with an error, the submit button stays permanently `disabled` with no message shown.

## 2.7 Verify `migration67_site_analytics.sql` was actually applied · **P0**

Unlike `migration62_phaseB_pending.sql`, this file has **no verification footer**. If it has not run: every
"Notify me at launch" submission still fails silently into the generic error, and the page counter writes
nothing. Confirm before you drive any traffic.

---

# Part 3 — The App

## 3.1 Localisation has regressed · **P1**

The readiness report claims "161 → 0 hardcoded strings." That is no longer true. `check:i18n` passes
because it only verifies that `t()` keys *resolve* — it cannot see a string literal that never went
through `t()`.

Current count: **28 visible hardcoded English strings** and **65 hardcoded English accessibility labels**
(and the detector skips array-literal strings, so the real visible count is higher — the Settings plan
modal alone adds ~22 more).

**The worst placement possible** — `screens/AuthScreen.js`, the first screen a new user ever sees:

```
AuthScreen.js:289  placeholder="Username or email"
AuthScreen.js:296  placeholder="Password"
AuthScreen.js:341  placeholder="Username (letters & numbers only)"
AuthScreen.js:363  placeholder="Password (6+ characters)"
```

A Japanese user opens the app, everything is in Japanese, and the login form is in English.

Others: `MangaDetailScreen` — "Demographic", "Chapters", "Volumes" · `CreatorDashboardScreen` —
"Creator Dashboard", "Short description...", "Select Genre" · `SettingsScreen` — "Deleting...",
"Yes, delete my account", and the entire Pro plan modal.

**All 65 accessibility labels are English**, so VoiceOver and TalkBack read English to a Japanese or
Korean user on every icon button in the app.

**Fix:** extend `scripts/check-i18n.js` to also flag string literals in `placeholder` / `accessibilityLabel`
/ `label` / `title` props and JSX text nodes. Otherwise this regresses again on the next screen.

## 3.2 Two of five tabs have no loading state · **P1**

`screens/ProfileScreen.js` (89 KB) and `screens/ForYouScreen.js` (50 KB) contain **zero** occurrences of
`loading`, `Skeleton`, `ActivityIndicator`, `spinner`, or `shimmer`. For comparison, `LibraryScreen` has 17.

Profile hydrates 20+ pieces of state from the network with no loading flag anywhere. On a cold start over a
slow connection, the user sees their profile with **0 chapters read, 0 badges, no friends, no favourites**,
then everything pops in. For a second, the app looks like it lost their data — on the screen that exists
specifically to show off what they have accumulated.

You already have `components/Skeleton.js`. Use it on both.

## 3.3 `MangaDetailScreen` has no pull-to-refresh · **P2**

It is the one content screen with neither `RefreshControl` nor `onRefresh`. Chapter lists go stale. Kenmei,
Comick, and every Mihon-family reader put pull-to-refresh on the series detail screen — it is the gesture
people reach for reflexively there.

## 3.4 Accessibility holes in specific components · **P2**

Touchables with essentially no labels:

| Component | Labelled / touchables |
|---|---|
| `CoachmarkOverlay.js` | **0 / 9** — the onboarding tour is unusable with a screen reader |
| `BadgeCeremony.js` | **0 / 3** |
| `AlertHost.js` | **0 / 3** — alert buttons unlabelled |
| `ShareCard.js` | 1 / 11 |
| `NotificationsScreen.js` | 1 / 9 |

## 3.5 Theme leaks remain in components that render inside themed screens · **P2**

Still no `useTheme`: `StarRating`, `ToastHost`, `BadgeIcon`, `BadgeDetail`, `BadgeCeremony`, `SourceProbe`,
`AuthButtons`, `CoverMorphOverlay`. `RecapScreen`, `IntroScreen`, `RecapStage`, `RecapExportCard`,
`RecapCompareModal` are art-directed and correctly opt out — the rest are genuine leaks. A toast in Light
theme still inherits dark-theme styling.

The good news: hardcoded `#7B5CFF` is down from 254 to **2**, and `colors.primary` is up to 233. That work
landed.

## 3.6 The DM reaction channel subscribes to every reaction in the app · **P2**

`screens/DMScreen.js:493` subscribes to `dm_message_reactions` INSERT and DELETE with **no filter**, then
discards irrelevant rows client-side via `messagesByIdRef`. Every reaction by every user in the entire app
is pushed to every open DM screen. Fine at 50 users, a firehose at 50,000. Add a filter, or scope it to the
thread's message ids.

## 3.7 Deep linking is custom-scheme only · **P1**

There is **no `.well-known/` directory** in `docs/`, no `associatedDomains` in `app.json`, and no Android
`intentFilters`. So:

- `https://mangarecs.net/catalog/title/aot/` will **never** open the app — not from Google results, not
  from a shared link, not from a friend's message.
- Only `mangarecs://` works, which iOS Safari handles poorly and which shows an unfriendly interstitial.
- Supabase password-reset and email-confirmation links cannot route into the app.

Webtoon, Discord, and every serious app ship Universal Links / App Links. You need
`docs/.well-known/apple-app-site-association` and `docs/.well-known/assetlinks.json` plus the matching
`app.json` config. **This requires a native rebuild**, so it has to happen before submission, not over OTA.

Related: the title page's "Open in the MangaRecs app" button deep-links to `mangarecs://series/<Title>`,
which drops the user into the **Reader** for a series they may not have in their library. From a marketing
page, the expected landing is the series detail / track screen. It also keys on the *title string* rather
than a stable id, so any naming mismatch between the catalog and the app pool dead-ends the search.

## 3.8 The Pro plan modal · **P1**

Good news first: the CTA is honest. It says "Notify Me When Pro Launches" and "Pricing shown is planned,
not final · You won't be charged today." That is the right call and it likely survives review. But three
things need fixing:

- **"50% OFF" is wrong.** $3.99/mo × 12 = $47.88. $29.99/yr is **37.4% off**, not 50%. Advertising a
  discount you do not give is a consumer-protection problem and both stores dislike it.
- **"Ad-supported experience"** is listed as a Free-tier feature (`SettingsScreen.js:1317`), and "No ads"
  as a Pro benefit. Meanwhile the website FAQ says *"No ads, nothing sold or rented to anyone"* and the
  privacy policy says *"We don't run ads."* The app tells users there are ads; the site tells them there
  are not. Pick one. There is no ad SDK in `package.json`, so today the site is correct and the app modal
  is wrong.
- Consider hiding exact prices pre-launch. A specific price for a product that cannot be bought invites a
  Guideline 2.1 completeness question, even with the disclaimer.

## 3.9 The public APK contradicts the site · **P3**

`README.md` carries a "Download APK" badge pointing at a live EAS artifact. The website FAQ says: *"No
sideloaded APK — it'll be a normal store install on both platforms."* Remove the badge before launch, or
change the FAQ.

---

# Part 4 — Terms, Privacy, and the legal surface

This is the weakest area and it is **launch-blocking**. There are two independent sets of documents that
disagree with each other, with the app, and with the product.

## 4.1 The app and the site contradict each other · **P0**

| | App (`screens/LegalScreen.js`) | Site (`docs/terms/`, `docs/privacy/`) |
|---|---|---|
| Contact | `support@mangarecs.net` | `hello@mangarecs.net` (with an unresolved `TODO: confirm real support address`) |
| Content source | "fetched live from the **MangaDex API**" | "sourced from **AniList's** public API" |
| Minimum age | "old enough under the laws of your country" | "at least 13 years old" |
| Creator Dashboard | Not mentioned at all | Called out as the one hosting exception |
| Last updated | July 3, 2026 | July 2026 |

Both are stale — v1.5.0 shipped on Aug 5 with features neither document covers.

**The email is the urgent one.** Both stores require a working support address on the listing, and the
`TODO: confirm real support address` comment appears in **7 files**. Confirm which mailbox exists and make
it the only one.

## 4.2 Things you actually do that neither policy discloses · **P0**

- **Sentry crash reporting** (`utils/crashReporting.js`) — captures exceptions and **attaches the
  signed-in user id**, sending them to a US third-party processor. Not named in either policy. Apple's
  privacy nutrition label requires declaring this.
- **AniList / MyAnimeList import** (v1.5.0) — sends your username to AniList's GraphQL API and to Jikan
  for MAL. Neither third party is listed in either policy.
- **MangaDex** — the app reads pages directly from MangaDex and its mirrors. The *website* privacy policy
  never mentions MangaDex, and its "Who we share it with" list is Supabase / Google / AniList only.
- **Expo push notification tokens** — the app policy mentions the token; the site's policy does not cover
  the app's data at all, yet it is the policy linked from the store listing.
- **The waitlist email** appears under "How we use it" but not under "What we collect," and there is no
  stated way to withdraw — a GDPR problem for a marketing list.

## 4.3 What is missing from both, professionally · **P0/P1**

Neither document has:

- **A DMCA / copyright complaint process.** For a manga app this is the single most important clause you
  do not have. You need a named agent, an address, and the statutory elements. The About page has an
  informal "email us and we'll look into it" — that is not a DMCA safe-harbour process, and safe harbour
  is exactly what protects you here.
- **Governing law and jurisdiction.** Deliberately deferred (there is a comment saying so). It has to be
  settled before submission.
- **Who the data controller is.** No legal entity, no address. GDPR Art. 13 requires both.
- **GDPR / UK GDPR rights** — access, rectification, erasure, portability, objection, and the right to
  complain to a supervisory authority. You have four EU/UK-relevant locales in your language switcher.
- **CCPA / CPRA** — "we don't sell data" needs to be stated in the statutory form, plus the consumer
  rights disclosure.
- **International data transfers** — Supabase region, transfer mechanism.
- **A data retention schedule** — the app says "as long as your account is active," which is not a schedule.
- **Security measures** — required by GDPR Art. 32.
- **Limitation of liability with a cap.** "No warranty" is there; a liability cap is not.
- **The user-content licence scope.** The app terms grant a display licence; the site terms do not mention
  user content at all — despite the Creator Dashboard hosting original uploaded work.
- **Creator terms.** Verified creators upload original series. There is no creator agreement anywhere: no
  rights warranty, no takedown process, no revenue terms, no moderation policy.
- **Apple's required EULA acknowledgement** (or your own EULA), and Apple's standard third-party
  beneficiary clause.
- **Breach notification commitment.**

## 4.4 The app's legal screen is not translated · **P1**

`screens/LegalScreen.js` holds `PRIVACY_SECTIONS` and `TERMS_SECTIONS` as hardcoded English constants. The
app is fully localised into six languages; its legal terms are English only. In the EU, terms need to be
available in the consumer's language to be enforceable.

## 4.5 One source of truth

Right now the same policy exists twice, hand-maintained, already divergent. Generate both from one source —
a JSON/MD file that renders into `docs/privacy/index.html`, `docs/terms/index.html`, and `LegalScreen.js` —
so they cannot drift again.

---

# Part 5 — The fix list

## P0 — before you submit

Decisions taken 2026-08-21, folded in below: **contact is `support@mangarecs.net`**
(mailbox not created yet), **US jurisdiction, individual or LLC**, and **no ads, ever**.

| # | Fix | Where |
|---|---|---|
| 1 | Rewrite Privacy + Terms properly: one source, DMCA process, US governing law, controller identity, GDPR + **CCPA/CPRA** rights, Sentry + AniList/MAL/MangaDex disclosure, retention schedule, liability cap, creator terms | both surfaces |
| 1b | **Register a DMCA agent with the US Copyright Office** (~$6). This is what actually buys safe harbour, and for a manga app it's the most important thing you don't have. | dmca.copyright.gov |
| 2 | **Create the `support@mangarecs.net` mailbox**, then switch the site's 17 `hello@` references and clear the `TODO` in all 7 files | mail host + 7 files |
| 3 | Fix the 395 mid-word-truncated synopses — truncate on a word boundary with `…` | `docs/catalog/title/*` |
| 4 | Verify `migration67_site_analytics.sql` actually ran, or the waitlist is still failing silently | Supabase |
| 5 | Drop "Ad-supported experience" from Free **and** "No ads" from Pro — decided: no ads ever, and the site already says so | `SettingsScreen.js:1317` |
| 6 | Fix the "50% OFF" badge (it is 37%) | `SettingsScreen.js` |

## P1 — before you drive traffic

| # | Fix | Where |
|---|---|---|
| 7 | Load `fonts.css` on about / terms / privacy / 404 | 4 files |
| 8 | Kill the hero gradient text; drop accent-tinted glow shadows | `docs/index.html` |
| 9 | Cut em-dashes ~51 → ~10; keep at most 3 "not X, Y" constructions | `docs/index.html` |
| 10 | Add theme script + analytics + topnav to all 712 title pages | generator |
| 11 | Translate `AuthScreen` placeholders and the other 27 visible strings | `screens/*` |
| 12 | Add loading states to Profile and ForYou (`Skeleton.js` already exists) | 2 screens |
| 13 | Enter-to-submit on the sign-in form; fix the error/success colour bug; `textContent` for email | `nav-widgets.js` |
| 14 | Universal Links + App Links (`.well-known/` × 2, `app.json` config) — **needs a native rebuild** | app + site |
| 15 | Either translate `features/` and `badges/`, or hide the switcher there | 2 files |
| 16 | Re-shoot screenshots at ≥1080px wide; add iOS captures | `assets/` |
| 17 | Put real Relic Vault artwork on the site; sign the maker note | `docs/index.html` |
| 18 | Serve covers from your own storage instead of hotlinking MangaDex, or correct the legal claim | generator |

## P2 — before you scale

| # | Fix |
|---|---|
| 19 | Translate the app's legal screen into all six languages |
| 20 | Localise the 65 accessibility labels |
| 21 | Add `/badges/` to the sitemap; add canonicals to terms/privacy; add OG tags to about/terms/privacy; refresh `lastmod` |
| 22 | Related-titles grid on title pages (the CSS already ships unused) — fixes 712 orphan pages |
| 23 | Filter the DM reaction realtime subscription |
| 24 | Rate-limit `launch_notify` and `site_events` |
| 25 | Pull-to-refresh on `MangaDetailScreen` |
| 26 | Accessibility labels for `CoachmarkOverlay` (0/9), `AlertHost` (0/3), `BadgeCeremony` (0/3) |
| 27 | Extend `check:i18n` to catch hardcoded literals, not just unresolved keys |
| 28 | `useTheme` in `StarRating`, `ToastHost`, `BadgeIcon`, `BadgeDetail`, `SourceProbe`, `AuthButtons` |
| 29 | Localise the site's dynamic strings (waitlist results, account panel) |

## P3 — polish

| # | Fix |
|---|---|
| 30 | Collapse 13 radius values to 3 tokens |
| 31 | Break the alternating-zigzag section rhythm |
| 32 | Replace the fake match percentages, or label the swipe demo as a demo |
| 33 | Populate the two "Sample profile" cards from live data |
| 34 | Remove the APK badge from the README (or change the FAQ) |
| 35 | Deep-link title pages to series detail, not the Reader; key on id, not title string |

---

# How you compare, on the things this review found

Measured against Kenmei, Comick, MangaUpdates, Mihon, Webtoon, and AniList's own app.

**Ahead:** Recap (nobody else ships a cinematic per-reader wrap-up), real social depth (DMs with reactions
and swipe-reply, per-chapter spoiler-tagged threads, presence, polls), reader + tracker + recs in one app,
and a 250-badge ladder that is a genuine differentiator.

**At parity:** import, library management, catalog breadth.

**Behind:** Universal Links (every one of them has it), catalog page quality — Comick and MangaUpdates
title pages have related titles, full synopses, and a working nav — and screenshot production values.

**The gap that matters most:** none of those apps' marketing sites can be mistaken for a template. Yours
currently can, and Part 1 is the whole fix.
