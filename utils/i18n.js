// Translation lookup.
//
// Keys are dotted paths into the per-language dictionaries in ./translations.
// Every language falls back to English key-by-key, not file-by-file: a partly
// translated language shows English for what's missing rather than breaking,
// which is what lets translations land incrementally instead of all at once.
//
// Interpolation is {name} style. Counts use an explicit `_one` / `_other`
// suffix rather than a plural library — the six languages here need nothing
// more, and a rule engine for languages the app doesn't have would be dead
// weight.

import { TRANSLATIONS } from './translations';
import { DEFAULT_APP_LANG, currentLanguage } from './language';

function lookup(dict, key) {
  if (!dict) return undefined;
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  ));
}

/**
 * @param {string} key    dotted path, e.g. 'settings.language.title'
 * @param {object} [vars] interpolation values; `count` also selects _one/_other
 * @param {string} [lang] override, otherwise the app's current language
 */
export function translate(key, vars, lang) {
  const language = lang || currentLanguage();
  let resolved = key;
  if (vars && typeof vars.count === 'number') {
    const suffixed = `${key}_${vars.count === 1 ? 'one' : 'other'}`;
    if (lookup(TRANSLATIONS[language], suffixed) || lookup(TRANSLATIONS[DEFAULT_APP_LANG], suffixed)) {
      resolved = suffixed;
    }
  }
  const hit = lookup(TRANSLATIONS[language], resolved)
    ?? lookup(TRANSLATIONS[DEFAULT_APP_LANG], resolved);
  // A missing key renders as the key itself. Loud on purpose — silently
  // rendering an empty string hides the gap until a user finds it.
  if (hit === undefined) {
    if (__DEV__) console.warn(`[i18n] missing key: ${resolved}`);
    return resolved;
  }
  return interpolate(hit, vars);
}

// Non-React callers (API helpers, toasts fired outside render).
export const t = translate;

/**
 * Translation with an explicit English fallback, for strings whose source of
 * truth lives outside the dictionaries — badge names and descriptions are
 * defined in badges.js and would be duplicated (and drift) if copied into
 * en.js. An untranslated badge shows its English name rather than a raw key.
 */
export function translateOr(key, fallback, vars, lang) {
  const language = lang || currentLanguage();
  const hit = lookup(TRANSLATIONS[language], key) ?? lookup(TRANSLATIONS[DEFAULT_APP_LANG], key);
  return hit === undefined ? fallback : interpolate(hit, vars);
}

// Which keys a language is actually missing — used by the translation
// coverage check rather than at runtime.
export function missingKeys(lang) {
  const out = [];
  const walk = (enNode, langNode, prefix) => {
    for (const [k, v] of Object.entries(enNode || {})) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        if (typeof langNode?.[k] !== 'string') out.push(path);
      } else {
        walk(v, langNode?.[k], path);
      }
    }
  };
  walk(TRANSLATIONS[DEFAULT_APP_LANG], TRANSLATIONS[lang], '');
  return out;
}
