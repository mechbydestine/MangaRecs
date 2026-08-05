// The app's language.
//
// One setting, app-wide. Changing it says "I am a Japanese reader", and
// everything that depends on who the reader is follows from it:
//
//   · which sites appear under Read Available (a Japanese reader wants LINE
//     Manga and Jump+, not the English WEBTOON — both showing at once was the
//     bug this was built for)
//   · which translation of a chapter the reader loads from MangaDex
//   · which site the reader falls back to when a series has to be searched
//
// UI strings are not translated yet. That's a separate, much larger piece of
// work, and it's called out rather than half-done — a menu in English with a
// Japanese setting selected is honest; a machine-translated menu is not.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const APP_LANG_KEY = '@mangarecs/language';
// Superseded key from when this was scoped to the source row only. Read once
// on first load so anyone who already picked a language keeps it.
const LEGACY_READING_LANG_KEY = '@mangarecs/readingLanguage';
export const DEFAULT_APP_LANG = 'en';

// Kept to languages the app can actually act on — each one has real source
// coverage and a MangaDex translation feed behind it.
export const APP_LANGUAGES = [
  { id: 'en', label: 'English',  native: 'English' },
  { id: 'ja', label: 'Japanese', native: '日本語' },
  { id: 'ko', label: 'Korean',   native: '한국어' },
  { id: 'zh', label: 'Chinese',  native: '中文' },
  { id: 'es', label: 'Spanish',  native: 'Español' },
  { id: 'fr', label: 'French',   native: 'Français' },
];

export function isSupportedLang(id) {
  return APP_LANGUAGES.some((l) => l.id === id);
}

export function langLabel(id) {
  return APP_LANGUAGES.find((l) => l.id === id)?.native || 'English';
}

// MangaDex uses BCP-47-ish codes for translated chapter feeds: `zh` for
// simplified, `pt-br` for Brazilian Portuguese, and so on. Only the ones that
// differ from our own ids need mapping.
const MANGADEX_LANG = { zh: 'zh' };

export function mangadexLangFor(id) {
  return MANGADEX_LANG[id] || id || 'en';
}

// Read synchronously by non-React code (API helpers) that can't await or use a
// hook. Kept in sync by the provider, which is the only writer.
let _current = DEFAULT_APP_LANG;

export function currentLanguage() {
  return _current;
}

export async function loadLanguage() {
  try {
    const raw = await AsyncStorage.getItem(APP_LANG_KEY);
    if (isSupportedLang(raw)) { _current = raw; return raw; }
    const legacy = await AsyncStorage.getItem(LEGACY_READING_LANG_KEY);
    if (isSupportedLang(legacy)) {
      _current = legacy;
      AsyncStorage.setItem(APP_LANG_KEY, legacy).catch(() => {});
      return legacy;
    }
  } catch (_) {}
  _current = DEFAULT_APP_LANG;
  return _current;
}

export async function persistLanguage(id) {
  if (!isSupportedLang(id)) return;
  _current = id;
  try {
    await AsyncStorage.setItem(APP_LANG_KEY, id);
  } catch (_) {}
}

// AniList reports link languages as English words, not codes.
const ANILIST_LANG_CODES = {
  english: 'en', japanese: 'ja', korean: 'ko', chinese: 'zh',
  spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', 'portuguese (br)': 'pt', russian: 'ru',
  thai: 'th', vietnamese: 'vi', indonesian: 'id',
};

export function normalizeLangName(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return ANILIST_LANG_CODES[key] || (/^[a-z]{2}$/.test(key) ? key : null);
}
