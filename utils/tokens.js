// Design tokens.
//
// Everything in this app's styling is hand-carried literals: spacing, radii,
// and type sizes are repeated inline across 43 screen/component files, and the
// brand purple appears as a raw `#7B5CFF` roughly 250 times. That's why adding
// the "Dark" palette to ThemeContext didn't visibly do much — Dark's whole
// differentiator is a muted primary, and the overwhelming majority of primary
// usage never asks the theme what the primary is.
//
// COLOURS LIVE IN ThemeContext, NOT HERE. Import `useTheme()` and read
// `colors.primary` / `colors.accent` / `colors.border` — anything that should
// change between Default, Dark, and Light must come from there or it won't.
// The BRAND block below exists only for the places a hook can't reach
// (module-scope StyleSheet.create blocks, native config, share images).
//
// Profile accent colours are a separate system — see utils/profileThemes.js.
// Those are user-chosen content, not app chrome, and are deliberately NOT
// theme-reactive.

// ── Spacing ────────────────────────────────────────────────────────────────
// 4pt base. The codebase already clusters around these values; named here so
// new screens stop inventing 13s and 17s.
export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// ── Corner radii ───────────────────────────────────────────────────────────
export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

// ── Type scale ─────────────────────────────────────────────────────────────
// `size` pairs with `weight`; line heights are intentionally omitted so text
// keeps scaling with the OS accessibility setting.
export const TYPE = {
  caption:  { fontSize: 11, fontWeight: '500' },
  footnote: { fontSize: 12, fontWeight: '500' },
  body:     { fontSize: 14, fontWeight: '400' },
  callout:  { fontSize: 15, fontWeight: '500' },
  headline: { fontSize: 16, fontWeight: '600' },
  title:    { fontSize: 20, fontWeight: '700' },
  display:  { fontSize: 28, fontWeight: '800' },
};

// ── Minimum hit target ─────────────────────────────────────────────────────
// Apple HIG is 44pt, Material is 48dp. 259 icons in this app render at 18px or
// smaller, so most interactive icons need either this minimum or a hitSlop.
export const MIN_TAP = 44;

// Standard hitSlop for a small icon button. Spread it: hitSlop={HIT_SLOP}
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Brand constants ────────────────────────────────────────────────────────
// Escape hatch ONLY. Reach for `colors.*` from useTheme() first — a value taken
// from here is frozen across all three palettes and will not respond to the
// theme picker. Legitimate uses: module-scope StyleSheet.create, app.json,
// notification tint, share-card rendering.
export const BRAND = {
  purple: '#7B5CFF',
  green:  '#1D9E75',
  ink:    '#0D0D0F',
};
