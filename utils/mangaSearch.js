import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SITE_KEY = '@mangarecs/defaultMangaSite';

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

// Real site favicon via Google's favicon service (same technique
// mangarecs.net's catalog page uses) — resolves each site's actual declared
// icon instead of guessing at /favicon.ico or using a plain emoji.
export function siteFaviconUrl(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch (_) {
    return null;
  }
}

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
  // Madara's own search, not /search?keyword= — that path 404s on this site
  // (verified live), so every ManhuaPlus search was landing on an error page.
  'manhuaplus.com':           (q) => `https://manhuaplus.com/?s=${encodeURIComponent(q)}&post_type=wp-manga`,
  'asurascans.com':           (q) => `https://asurascans.com/?s=${encodeURIComponent(q)}&post_type=wp-manga`,
  'mangahub.io':              (q) => `https://mangahub.io/search/page/1?q=${encodeURIComponent(q)}`,
  'manganato.gg':             (q) => `https://manganato.gg/search/story/${encodeURIComponent(q).replace(/%20/g, '_')}`,
  'mangakatana.com':          (q) => `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`,
  'mangapill.com':            (q) => `https://mangapill.com/search?q=${encodeURIComponent(q)}`,
  'mangago.me':               (q) => `https://www.mangago.me/search/?q=${encodeURIComponent(q)}`,
  'fanfox.net':               (q) => `https://fanfox.net/search?title=${encodeURIComponent(q)}`,
  // Removed 2026-08-10, all four dead at DNS rather than merely blocked:
  // likemanga.io, zinmanga.com, aquamanga.com, bato.to. A builder for a domain
  // that no longer resolves costs a full navigation timeout before the
  // fallback chain moves on, so leaving them in is slower than having no entry
  // at all.
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
