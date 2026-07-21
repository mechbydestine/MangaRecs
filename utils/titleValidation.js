// Single source of truth for "does this look like a real manga/series title,
// or is it junk scraped off a site's chrome (homepage, search page, login
// wall, etc.)?" — previously duplicated as two separate, out-of-sync lists
// (readerUtils.js's INVALID_TITLES, LibraryScreen.js's INVALID_HIST_TITLE),
// neither of which caught generic non-title page headings like "Homepage" or
// "Recent Searches" showing up as if they were a manga you're reading.

const KNOWN_SITE_NAMES = [
  'reader', 'browser', 'mangarecs',
  'mangadex', 'mangafire', 'webtoon', 'asura scans', 'weeb central',
  'manga plus', 'mangahub', 'cubari proxy', 'dynasty reader', 'scans.gg',
  'likemanga', 'mangago', 'mangakatana', 'mangapill', 'manhuaplus',
  'manhuabuddy', 'mangakawaii', 'manganato', 'vymanga', 'zinmanga',
  'aqua manga', 'mangaball', 'mangafreak', 'mangafox', 'readmanga',
];

// Exact (whole-string) matches — generic site/app chrome, never a real title
const EXACT_JUNK = new Set([
  ...KNOWN_SITE_NAMES,
  'search results', 'search result', 'results', 'search', 'home', 'homepage',
  'home page', 'untitled', 'new tab', 'google search', 'just a moment',
  'sign in', 'log in', 'login', 'sign up', 'register', 'account',
  'bookmark', 'bookmarks', 'history', 'recent', 'recently viewed',
  'recent searches', 'recent search', 'browse', 'categories', 'genres',
  'settings', 'trending', 'popular', 'latest', 'new releases', 'not found',
  'access denied', 'blocked',
]);

// Prefix/substring patterns — a page whose title merely STARTS WITH or
// CONTAINS one of these is chrome/navigation, not a manga title, regardless
// of what site-name suffix got tacked onto it ("Homepage - Hentai.tld" still
// isn't a series called "Homepage").
const JUNK_PATTERNS = [
  /^home(page)?\b/i,
  /^search\b/i,
  /^browse\b/i,
  /^login\b/i,
  /^sign[\s-]?(in|up)\b/i,
  /recent search/i,
  /search results?/i,
  /advanced search/i,
  /^404\b/,
  /^error\b/i,
  /not found/i,
  /access denied/i,
  /please wait/i,
  /redirecting/i,
  /^loading/i,
];

export function isJunkTitle(rawTitle) {
  const title = (rawTitle || '').trim();
  if (!title) return true;
  if (title.startsWith('http')) return true;
  const lower = title.toLowerCase();
  if (EXACT_JUNK.has(lower)) return true;
  if (JUNK_PATTERNS.some((re) => re.test(title))) return true;
  return false;
}
