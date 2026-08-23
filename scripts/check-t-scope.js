#!/usr/bin/env node
/**
 * Finds t(...) calls that will not reach the translation function at runtime.
 *
 * Two failure modes, both guaranteed crashes the moment the component renders,
 * and nothing else catches either: check-i18n.js sees the key and resolves it
 * happily, check-hardcoded-strings.js sees a t() call and moves on, the test
 * suite doesn't mount these screens, and a grep for "does this file import
 * useT" passes — because the file usually does import it, just into a
 * different component than the one calling it.
 *
 *   1. NO BINDING   — no `t` in any enclosing scope.
 *   2. SHADOWED     — the nearest `t` is bound to something that is not the
 *                     translation function, so calling it throws
 *                     "t is not a function".
 *
 * (2) is the subtler one and the reason this file uses real scope resolution
 * rather than a scope stack. components/ToastHost.js did
 *
 *     const t = TYPE_STYLES[type];        // { icon, color }
 *     ...  accessibilityLabel={t('a11y.dismiss')}
 *
 * which crashed on every toast in the app. The binding existed, so the older
 * stack-based version of this check passed it.
 *
 * Three instances of (1) were caught during the 2026-08-21 i18n pass
 * (MobileHeader, and two sub-components in LeaderboardScreen that take
 * `colors` as a prop and had no hook of their own). An earlier audit hit the
 * same class in AuthScreen.
 *
 *   node scripts/check-t-scope.js
 *   node scripts/check-t-scope.js --strict
 *
 * Deliberately not an npm script: package.json's `scripts` field is hashed
 * into the Expo runtime fingerprint, so adding one silently breaks OTA
 * reachability for every installed build. See scripts/check-hardcoded-strings.js.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['screens', 'components', 'utils'];

// utils/i18n.js defines `export const t = translate` — it IS the function.
const SKIP = new Set(['utils/i18n.js']);

// Inits that are definitely not callable. Calling one throws.
const NOT_CALLABLE = new Set([
  'MemberExpression', 'ObjectExpression', 'ArrayExpression',
  'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral',
  'TemplateLiteral', 'BinaryExpression',
]);

/**
 * Can this binding be called at all? A local arrow named `t` is callable, so
 * it cannot produce "t is not a function" — a screen may legitimately name a
 * local helper `t` (ProfileScreen's animation builder does). What crashes is a
 * `t` bound to a value: an object, a property lookup, a string.
 */
function bindingIsCallable(binding) {
  const kind = binding.kind;
  if (kind === 'param' || kind === 'module') return true;

  const node = binding.path.node;
  if (node.type !== 'VariableDeclarator') return true; // function declaration
  if (node.id.type === 'ObjectPattern') return true;   // `const { t } = ...`

  const init = node.init;
  if (!init) return false;
  return !NOT_CALLABLE.has(init.type);
}

/**
 * A call that looks like a translation: exactly one string-literal argument
 * shaped like a key ("a11y.dismiss"), optionally followed by a params object.
 * Used to catch a translation call that lands in a callable local helper —
 * no crash, but the wrong function, and the string never gets translated.
 */
function looksLikeTranslationCall(node) {
  const [first] = node.arguments;
  if (!first || first.type !== 'StringLiteral') return false;
  if (!/^[a-zA-Z][\w]*\.[\w.]+$/.test(first.value)) return false;
  return node.arguments.length <= 2;
}

/** Is this binding plausibly the translation function itself? */
function bindingIsTranslator(binding) {
  const kind = binding.kind;
  if (kind === 'param' || kind === 'module') return true;
  const node = binding.path.node;
  if (node.type !== 'VariableDeclarator') return true;
  if (node.id.type === 'ObjectPattern') return true;
  const init = node.init;
  if (!init) return false;
  if (init.type === 'CallExpression' && init.callee.type === 'Identifier'
      && /^use[A-Z]/.test(init.callee.name)) return true;
  if (init.type === 'Identifier' && /translate|^t$/.test(init.name)) return true;
  return false;
}

function describe(binding) {
  const n = binding.path.node;
  if (n.type === 'VariableDeclarator' && n.init) {
    const i = n.init;
    if (i.type === 'MemberExpression') return 'a property lookup';
    if (i.type === 'CallExpression') {
      const c = i.callee;
      return `the result of ${c.type === 'Identifier' ? c.name + '()' : 'a call'}`;
    }
    if (i.type === 'ArrowFunctionExpression' || i.type === 'FunctionExpression') return 'a local helper function';
    if (i.type === 'Identifier') return `\`${i.name}\``;
    if (i.type === 'BinaryExpression' || i.type === 'LogicalExpression') return 'an expression';
    return 'a ' + i.type;
  }
  return 'a non-translation value';
}

const problems = [];
let calls = 0;

for (const dir of DIRS) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!f.endsWith('.js')) continue;
    const rel = dir + '/' + f;
    if (SKIP.has(rel)) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!/\bt\(/.test(src)) continue;

    let ast;
    try {
      ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
    } catch (e) {
      problems.push({ at: rel, why: 'parse error: ' + e.message });
      continue;
    }

    traverse(ast, {
      CallExpression(p) {
        const callee = p.node.callee;
        if (callee.type !== 'Identifier' || callee.name !== 't') return;
        calls++;
        const binding = p.scope.getBinding('t');
        const line = p.node.loc ? p.node.loc.start.line : 0;
        if (!binding) {
          problems.push({
            at: `${rel}:${line}`,
            why: 'no `t` in any enclosing scope — this crashes on render',
          });
          return;
        }
        const declLine = binding.path.node.loc ? binding.path.node.loc.start.line : 0;
        if (!bindingIsCallable(binding)) {
          problems.push({
            at: `${rel}:${line}`,
            why: `\`t\` here is ${describe(binding)} bound at line ${declLine} — this throws "t is not a function"`,
          });
          return;
        }
        // Callable, but not the translator, and being handed a translation
        // key: the string silently never gets translated.
        if (!bindingIsTranslator(binding) && looksLikeTranslationCall(p.node)) {
          problems.push({
            at: `${rel}:${line}`,
            why: `looks like a translation call, but \`t\` here is ${describe(binding)} bound at line ${declLine}`,
          });
        }
      },
    });
  }
}

console.log(`${calls} t() call site(s) checked`);
if (!problems.length) {
  console.log('OK — every t() resolves to the translation function');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p.at}\n      ${p.why}`);
}

if (process.argv.includes('--strict') && problems.length) process.exit(1);
