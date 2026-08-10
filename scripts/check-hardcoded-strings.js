#!/usr/bin/env node
/**
 * Finds user-facing English text that never went through t().
 *
 * check-i18n.js verifies that every t() key resolves in all six languages —
 * it cannot see a string that was never wrapped in t() at all, so the app can
 * report "0 missing keys" while still showing English to a Japanese user.
 * This is the other half of that check.
 *
 *   node scripts/check-hardcoded-strings.js
 *   node scripts/check-hardcoded-strings.js --strict
 *
 * Deliberately not an npm script: package.json's `scripts` field is hashed
 * into the Expo runtime fingerprint. See scripts/check-a11y.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['screens', 'components'];

// Props whose value is shown to the user.
const TEXT_PROPS = ['placeholder', 'title', 'label', 'accessibilityLabel', 'accessibilityHint'];

// Words that look like copy but are identifiers, styling or developer text.
const IGNORE = /^(https?:|@|#|\d|[a-z-]+$)/;

function sourceFiles() {
  const out = [];
  for (const d of DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) out.push(path.join(dir, f));
  }
  return out;
}

const lineOf = (s, i) => s.slice(0, i).split(/\r?\n/).length;
const findings = [];

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  // 1. Literal string props: placeholder="Write your bio..."
  for (const prop of TEXT_PROPS) {
    const re = new RegExp(`\\b${prop}=["']([^"']{4,})["']`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const value = m[1];
      if (IGNORE.test(value)) continue;
      if (!/[A-Z]|\s/.test(value)) continue; // single lowercase token — likely an id
      findings.push({ file: rel, line: lineOf(src, m.index), kind: prop, text: value });
    }
  }

  // 2. Literal text nodes: <Text ...>Some sentence</Text>
  const textRe = /<Text\b[^>]*>\s*([^<>{}\n][^<>{}]{3,})\s*<\/Text>/g;
  let t;
  while ((t = textRe.exec(src))) {
    const value = t[1].trim();
    if (!value || IGNORE.test(value)) continue;
    if (!/[A-Za-z]{3}/.test(value)) continue;   // punctuation / glyphs only
    if (!/\s|[A-Z]/.test(value)) continue;
    findings.push({ file: rel, line: lineOf(src, t.index), kind: 'Text', text: value });
  }
}

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

console.log(`${findings.length} hardcoded user-facing string(s) across ${Object.keys(byFile).length} file(s)\n`);
for (const [file, list] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(list.length).padStart(3)}  ${file}`);
  for (const f of list) console.log(`       L${String(f.line).padEnd(5)} ${f.kind.padEnd(18)} ${JSON.stringify(f.text)}`);
}

if (process.argv.includes('--strict') && findings.length) process.exit(1);
