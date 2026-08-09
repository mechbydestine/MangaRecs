#!/usr/bin/env node
/**
 * Accessibility regression check — the companion to check-i18n.js.
 *
 * Catches the one gap a sighted developer never notices: a control that shows
 * only an icon and therefore announces as a bare "button" to VoiceOver and
 * TalkBack. A touchable that renders visible <Text> is fine — the screen
 * reader reads the text — so only icon-only controls are reported.
 *
 * A dismiss scrim is not a finding: an overlay marked `accessible={false}`
 * (so its children stay reachable) or `accessibilityElementsHidden` (an empty
 * backdrop) is the correct treatment, not a missing label.
 *
 *   node scripts/check-a11y.js            report only
 *   node scripts/check-a11y.js --strict   exit 1 when anything is unlabelled
 *
 * Deliberately NOT wired into package.json as `npm run check:a11y`. The
 * `scripts` field of package.json is hashed into the Expo runtime fingerprint
 * (verified: `npx @expo/fingerprint fingerprint:generate .` lists a
 * `packageJson:scripts` source), so adding one line there bumps the runtime
 * version and orphans every already-installed build from OTA updates until it
 * is rebuilt. Add the npm alias only alongside the next native build.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['screens', 'components'];
const TOUCHABLES = ['TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Pressable'];

function sourceFiles() {
  const out = [];
  for (const d of DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) out.push(path.join(dir, f));
  }
  return out;
}

// Walk from `<Tag` to the matching close tag, tracking `{}` depth so a brace
// expression containing a bare `>` (`a > b`) doesn't end the opening tag early.
function elementSpan(src, start, tag) {
  let depth = 0;
  let openEnd = start;
  let selfClosing = false;
  for (let k = start; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      openEnd = k;
      selfClosing = src[k - 1] === '/';
      break;
    }
  }
  if (selfClosing) return { openEnd, end: openEnd };

  let nest = 1;
  let i = openEnd + 1;
  const openRe = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'g');
  while (i < src.length && nest > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const open = openRe.exec(src);
    const close = closeRe.exec(src);
    if (!close) break;
    if (open && open.index < close.index) { nest++; i = open.index + 1; }
    else { nest--; i = close.index + (nest === 0 ? close[0].length : 1); }
  }
  return { openEnd, end: i };
}

const lineOf = (src, i) => src.slice(0, i).split(/\r?\n/).length;

const findings = [];
let labelled = 0;
let exempt = 0;

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  for (const tag of TOUCHABLES) {
    const re = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const { openEnd, end } = elementSpan(src, m.index, tag);
      const open = src.slice(m.index, openEnd + 1);
      const body = src.slice(openEnd + 1, end);

      // Props spread in from elsewhere — can't judge statically.
      if (/\{\.\.\./.test(open)) continue;

      if (/accessibilityLabel\s*=/.test(open)) { labelled++; continue; }
      // Deliberately removed from the accessibility tree.
      if (/accessible\s*=\s*\{\s*false\s*\}|accessibilityElementsHidden|importantForAccessibility\s*=\s*["']no/.test(open)) {
        exempt++;
        continue;
      }
      // Renders its own text, so the label comes from the content.
      if (/<Text[\s>]|<Animated\.Text[\s>]|\{children\}/.test(body)) continue;

      const icon = (body.match(/name=\{?["']([a-z0-9-]+)["']/i) || [])[1] || 'unknown';
      findings.push({ file: rel, line: lineOf(src, m.index), tag, icon });
    }
  }
}

const total = labelled + exempt + findings.length;
console.log(`${total} icon-only or unlabelled touchables inspected`);
console.log(`  ${labelled} labelled`);
console.log(`  ${exempt} intentionally hidden from assistive tech`);
console.log(`  ${findings.length} missing an accessibilityLabel`);

if (findings.length) {
  console.log('');
  const byFile = {};
  for (const f of findings) (byFile[f.file] ||= []).push(f);
  for (const [file, list] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${file}`);
    for (const f of list) console.log(`    L${f.line}  <${f.tag}> icon="${f.icon}"`);
  }
  console.log('\nAdd accessibilityLabel={t(\'…\')}, or accessible={false} if it is a dismiss scrim.');
}

if (process.argv.includes('--strict') && findings.length) process.exit(1);
