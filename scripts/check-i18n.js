#!/usr/bin/env node
// Verifies every t('…') key used in the app resolves in every language.
//
// English is the fallback, so a key missing only from ja/ko/zh/es/fr degrades
// quietly to English and is easy to ship without noticing. A key missing from
// en.js too renders the raw key path on screen. This catches both.
//
//   node scripts/check-i18n.js          # report
//   node scripts/check-i18n.js --strict # exit 1 if anything is missing
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'ja', 'ko', 'zh', 'es', 'fr'];

function loadLang(lang) {
  const src = fs
    .readFileSync(path.join(ROOT, 'utils/translations', `${lang}.js`), 'utf8')
    .replace('export default', 'module.exports =');
  const m = new module.constructor();
  m._compile(src, path.join(ROOT, 'utils/translations', `${lang}.__check.js`));
  return m.exports;
}

function get(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function sourceFiles() {
  const dirs = ['screens', 'components', 'utils'];
  const out = [path.join(ROOT, 'App.js')];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      if (f.endsWith('.js')) out.push(path.join(ROOT, d, f));
    }
  }
  return out;
}

const dicts = Object.fromEntries(LANGS.map((l) => [l, loadLang(l)]));

// t('a.b') and t('a.b', { … }) — single-quoted literal keys only. A dynamic
// key can't be checked statically, and there are none in this codebase.
const KEY_RE = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;

const used = new Map(); // key -> Set(files)
for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = KEY_RE.exec(src))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(rel);
  }
}

let problems = 0;
const missingByLang = Object.fromEntries(LANGS.map((l) => [l, []]));

// Counts resolve through an explicit `_one` / `_other` suffix (see
// utils/i18n.js translate()), so `t('detail.sourcesFound', { count })` is
// satisfied by sourcesFound_one + sourcesFound_other and never by a bare key.
function resolves(dict, key) {
  if (typeof get(dict, key) === 'string') return true;
  return (
    typeof get(dict, `${key}_one`) === 'string' &&
    typeof get(dict, `${key}_other`) === 'string'
  );
}

for (const [key, files] of [...used.entries()].sort()) {
  for (const lang of LANGS) {
    if (!resolves(dicts[lang], key)) {
      missingByLang[lang].push({ key, files: [...files] });
      problems++;
    }
  }
}

console.log(`${used.size} distinct t() keys used across the app`);
for (const lang of LANGS) {
  const miss = missingByLang[lang];
  if (!miss.length) {
    console.log(`  ${lang}: ok`);
    continue;
  }
  console.log(`  ${lang}: ${miss.length} MISSING`);
  for (const { key, files } of miss) console.log(`      ${key}  (${files.join(', ')})`);
}

// The reverse direction: keys defined in en.js that nothing uses. Not an
// error — some are used via computed lookups — but worth seeing when pruning.
if (process.argv.includes('--unused')) {
  const flat = [];
  (function walk(o, prefix) {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') flat.push(prefix ? `${prefix}.${k}` : k);
      else if (v && typeof v === 'object') walk(v, prefix ? `${prefix}.${k}` : k);
    }
  })(dicts.en, '');
  const unused = flat.filter((k) => !used.has(k));
  console.log(`\n${unused.length} keys defined in en.js with no literal t() call:`);
  console.log(unused.map((k) => '  ' + k).join('\n'));
}

if (problems && process.argv.includes('--strict')) process.exit(1);
