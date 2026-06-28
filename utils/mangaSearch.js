import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SITE_KEY = '@panelr/defaultMangaSite';

export const TOP_SITES = [
  { name: 'MangaDex',    url: 'https://mangadex.org',        emoji: '📚' },
  { name: 'MangaFire',   url: 'https://mangafire.to',        emoji: '🔥' },
  { name: 'Asura Scans', url: 'https://asurascans.com',      emoji: '⚡' },
  { name: 'Webtoon',     url: 'https://www.webtoons.com',    emoji: '🎨' },
  { name: 'Weeb Central',url: 'https://weebcentral.com',     emoji: '⚡' },
  { name: 'Manga Plus',  url: 'https://mangaplus.shueisha.co.jp', emoji: '⭐' },
];

// Sites available in the browser picker
export const ALL_SUPPORTED_SITES = [
  { name: 'MangaDex',   url: 'https://mangadex.org',             emoji: '📚', desc: 'Universal manga database — default source' },
  { name: 'Webtoon',    url: 'https://www.webtoons.com',         emoji: '🎨', desc: 'Official LINE Webtoon — English webtoons' },
  { name: 'Manga Plus', url: 'https://mangaplus.shueisha.co.jp', emoji: '⭐', desc: 'Official Shueisha — Jump titles' },
  { name: 'MangaFire',  url: 'https://mangafire.to',             emoji: '🔥', desc: 'Japanese manga browser' },
  { name: 'Asura Scans',url: 'https://asurascans.com',           emoji: '⚡', desc: 'Korean manhwa browser' },
  { name: 'Weeb Central',url: 'https://weebcentral.com',         emoji: '⚡', desc: 'Community manga browser' },
];

/**
 * Returns the primary reading site for a given content language/type.
 * - en  → Webtoon (official LINE Webtoon)
 * - all others → MangaDex
 */
export function getReadingSiteForLang(lang) {
  if (lang === 'en') return { name: 'Webtoon', url: 'https://www.webtoons.com', emoji: '🎨' };
  return { name: 'MangaDex', url: 'https://mangadex.org', emoji: '📚' };
}

// Per-site search URL builders
const SEARCH_BUILDERS = {
  'mangadex.org':             (q) => `https://mangadex.org/search?q=${encodeURIComponent(q)}`,
  'mangafire.to':             (q) => `https://mangafire.to/filter?keyword=${encodeURIComponent(q)}`,
  'weebcentral.com':          (q) => `https://weebcentral.com/search?term=${encodeURIComponent(q)}`,
  'webtoons.com':             (q) => `https://www.webtoons.com/en/search?keyword=${encodeURIComponent(q)}`,
  'manhuaplus.com':           (q) => `https://manhuaplus.com/search?keyword=${encodeURIComponent(q)}`,
  'asurascans.com':           (q) => `https://asurascans.com/?s=${encodeURIComponent(q)}&post_type=wp-manga`,
  'mangahub.io':              (q) => `https://mangahub.io/search/page/1?q=${encodeURIComponent(q)}`,
  'manganato.gg':             (q) => `https://manganato.gg/search/story/${encodeURIComponent(q).replace(/%20/g, '_')}`,
  'mangakatana.com':          (q) => `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`,
  'mangapill.com':            (q) => `https://mangapill.com/search?q=${encodeURIComponent(q)}`,
  'likemanga.io':             (q) => `https://likemanga.io/?s=${encodeURIComponent(q)}&post_type=wp-manga`,
  'zinmanga.com':             (q) => `https://zinmanga.com/?s=${encodeURIComponent(q)}&post_type=wp-manga`,
  'mangago.me':               (q) => `https://www.mangago.me/search/?q=${encodeURIComponent(q)}`,
  'fanfox.net':               (q) => `https://fanfox.net/search?title=${encodeURIComponent(q)}`,
  'bato.to':                  (q) => `https://bato.to/search?word=${encodeURIComponent(q)}`,
};

export function buildSearchUrl(siteUrl, title) {
  const domain = siteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const entry  = Object.entries(SEARCH_BUILDERS).find(([key]) => domain.includes(key));
  if (entry) return entry[1](title);
  // generic fallback
  return `${siteUrl.replace(/\/$/, '')}/?s=${encodeURIComponent(title)}`;
}

export async function getDefaultSite() {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_SITE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return TOP_SITES[0]; // MangaDex as app default
}

export async function setDefaultSite(site) {
  await AsyncStorage.setItem(DEFAULT_SITE_KEY, JSON.stringify(site));
}
