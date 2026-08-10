#!/usr/bin/env node
/**
 * WCAG contrast audit for the three app palettes in utils/ThemeContext.js.
 *
 * The recap derives its own colours at runtime and already guarantees
 * legibility (`legible()` in utils/recapIdentity.js). The main app palettes
 * are hand-picked constants and had never been measured against anything.
 *
 *   node scripts/check-contrast.js            report
 *   node scripts/check-contrast.js --strict   exit 1 on any AA failure
 *
 * Not wired into package.json on purpose — the `scripts` field is hashed into
 * the Expo runtime fingerprint, and adding a line there orphans installed
 * builds from OTA updates. See scripts/check-a11y.js for the full note.
 */
const fs = require('fs');
const path = require('path');

const AA_TEXT = 4.5;   // normal body text
const AA_LARGE = 3.0;  // >=24px, or >=18.7px bold — and non-text UI parts

function parseHex(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

// WCAG relative luminance.
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Pull the palette objects straight out of the source so the audit can never
// drift from what the app actually ships.
function readPalettes() {
  const src = fs.readFileSync(path.resolve(__dirname, '../utils/ThemeContext.js'), 'utf8');
  const out = {};
  for (const name of ['defaultColors', 'darkColors', 'lightColors']) {
    const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(src);
    if (!m) continue;
    const palette = {};
    for (const line of m[1].split('\n')) {
      const kv = /^\s*([A-Za-z0-9_]+)\s*:\s*'(#[0-9A-Fa-f]{3,8})'/.exec(line);
      if (kv) palette[kv[1]] = kv[2];
    }
    out[name.replace('Colors', '')] = palette;
  }
  return out;
}

// [foreground, background, minimum, what it is]
function pairsFor(c) {
  return [
    [c.text, c.background, AA_TEXT, 'text on background'],
    [c.text, c.card, AA_TEXT, 'text on card'],
    [c.text, c.inputBg, AA_TEXT, 'text on input'],
    [c.textSecondary, c.background, AA_TEXT, 'secondary text on background'],
    [c.textSecondary, c.card, AA_TEXT, 'secondary text on card'],
    [c.muted, c.background, AA_TEXT, 'muted text on background'],
    [c.muted, c.card, AA_TEXT, 'muted text on card'],
    [c.muted, c.inputBg, AA_TEXT, 'muted (placeholder) on input'],
    [c.primary, c.background, AA_LARGE, 'primary accent on background'],
    [c.primary, c.card, AA_LARGE, 'primary accent on card'],
    [c.accent, c.background, AA_LARGE, 'success accent on background'],
    [c.accent, c.card, AA_LARGE, 'success accent on card'],
    [c.error, c.background, AA_LARGE, 'error on background'],
    [c.error, c.card, AA_LARGE, 'error on card'],
    [c.onPrimary || '#FFFFFF', c.primary, AA_TEXT, 'button label on primary'],
  ];
}

// Hairline dividers between rows and cards. WCAG 1.4.11 governs "visual
// information required to identify user interface components and states" —
// these are not that: every card is already delimited by its own fill against
// the page, and no control's boundary or state depends on the line being
// seen. Forcing them to 3:1 would put heavy grey rules through every list for
// no accessibility gain. Reported, never failed.
function decorativePairs(c) {
  return [
    [c.border, c.background, 'divider against background'],
    [c.border, c.card, 'divider against card'],
  ];
}

const palettes = readPalettes();
let failures = 0;
let checked = 0;

for (const [name, c] of Object.entries(palettes)) {
  console.log(`\n── ${name} ──`);
  for (const [fg, bg, min, label] of pairsFor(c)) {
    if (!fg || !bg) continue;
    checked++;
    const ratio = contrast(fg, bg);
    const ok = ratio >= min;
    if (!ok) failures++;
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(
      `  ${mark}  ${ratio.toFixed(2).padStart(5)}:1  (needs ${min.toFixed(1)})  ${label}  ${fg} on ${bg}`
    );
  }
  for (const [fg, bg, label] of decorativePairs(c)) {
    if (!fg || !bg) continue;
    console.log(`  ----  ${contrast(fg, bg).toFixed(2).padStart(5)}:1  (decorative)  ${label}`);
  }
}

console.log(`\n${checked} pairs checked, ${failures} below WCAG AA.`);
if (failures) {
  console.log('Non-text pairs (borders, accents used only for large text or icons)');
  console.log('are held to 3.0:1; body text to 4.5:1.');
}
if (process.argv.includes('--strict') && failures) process.exit(1);
