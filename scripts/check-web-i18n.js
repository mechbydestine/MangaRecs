#!/usr/bin/env node
// Verifies every data-i18n key used in docs/ resolves in docs/assets/i18n.js.
//
// The sibling check-i18n.js does this for the React Native app (screens/,
// components/, utils/) but never looked at the website, which has its own
// separate dictionary. That gap shipped: a "growing.seeAll" key was added to
// index.html, the dictionary copy the browser had was stale, and the homepage
// rendered the literal string "growing.seeAll" where a button label belonged.
//
// t() falls back en -> raw key, so:
//   missing from ja/ko/zh/es/fr  = that locale quietly shows English
//   missing from en too          = the key path renders on screen
//
//   node scripts/check-web-i18n.js          # report
//   node scripts/check-web-i18n.js --strict # exit 1 if anything is missing
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const I18N = path.join(DOCS, 'assets/i18n.js');
const STRICT = process.argv.includes('--strict');

// Generated title pages are templated from one source and carry no keys of
// their own; walking 587 of them just slows the check down.
const SKIP_DIRS = new Set(['title', 'assets']);

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) htmlFiles(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// The dictionary is `var T = { en: {...}, ja: {...} }` inside an IIFE, so it
// can't be required. Slice out the object literal and eval just that.
function loadDicts() {
  const src = fs.readFileSync(I18N, 'utf8');
  const start = src.indexOf('var T = {');
  if (start === -1) throw new Error('could not find `var T = {` in docs/assets/i18n.js');
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error('unbalanced braces in the T dictionary');
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src.slice(open, end))();
}

function keysIn(html) {
  const found = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) found.add(m[1].trim());
  // data-i18n-attr="alt:some.key, aria-label:other.key"
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(',')) {
      const parts = pair.split(':');
      if (parts.length === 2) found.add(parts[1].trim());
    }
  }
  return found;
}

const dicts = loadDicts();
const locales = Object.keys(dicts);
if (!dicts.en) {
  console.error('docs/assets/i18n.js has no `en` dictionary to fall back to.');
  process.exit(1);
}

const usage = new Map(); // key -> Set(files)
for (const file of htmlFiles(DOCS)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const key of keysIn(fs.readFileSync(file, 'utf8'))) {
    if (!usage.has(key)) usage.set(key, new Set());
    usage.get(key).add(rel);
  }
}

const broken = [];   // not even in en: renders the raw key
const partial = [];  // in en only: other locales silently show English

for (const [key, files] of [...usage].sort()) {
  const missing = locales.filter((l) => typeof dicts[l][key] !== 'string');
  if (!missing.length) continue;
  const entry = { key, files: [...files], missing };
  if (missing.includes('en')) broken.push(entry); else partial.push(entry);
}

console.log(`Checked ${usage.size} data-i18n keys across ${locales.length} locales (${locales.join(', ')}).`);

if (broken.length) {
  console.log(`\n${broken.length} key(s) missing from en, these render as raw text on the page:`);
  for (const b of broken) console.log(`  ${b.key}  <- ${b.files.join(', ')}`);
}
if (partial.length) {
  console.log(`\n${partial.length} key(s) missing from some locales, these fall back to English:`);
  for (const p of partial) console.log(`  ${p.key}  missing: ${p.missing.join(', ')}`);
}

// Keys defined but no longer used anywhere. Not an error, just dead weight.
const unused = Object.keys(dicts.en).filter((k) => !usage.has(k));
if (unused.length) console.log(`\n${unused.length} key(s) defined in en but unused in docs/.`);

if (!broken.length && !partial.length) console.log('\nAll website i18n keys resolve in every locale.');

if (STRICT && (broken.length || partial.length)) process.exit(1);
