// What is allowed to become a Library entry.
//
// The reader is a real browser, and people use it as one. The moment someone
// follows a link out to YouTube, a wiki, a Discord invite or a Google result,
// the reader kept doing what it does for a chapter page: parse a title out of
// the document and write it into the reading history. That is where the mess
// in Library comes from — video titles and forum threads sitting in Reading
// next to actual series, each with its own junk cover.
//
// So eligibility is decided by the HOST, not by whether a title could be
// parsed. A page only becomes a Library entry if it is on a site that exists
// to publish comics. Everything else is still browsable, and still shows up in
// the "recent site" bar so it can be returned to — it just never becomes a
// series.
//
// The list is deliberately an allowlist. A blocklist would need to enumerate
// the whole internet, and the failure direction matters: a missing reading
// site costs one un-tracked chapter, while a missing blocklist entry puts a
// YouTube video in someone's library permanently.

// Hosts whose pages are comics. Matched on the registrable suffix, so
// subdomains (m.mangafire.to, comic.pixiv.net) are covered without listing
// each one.
const READING_HOSTS = [
  // Aggregators the reader actually opens
  // Dead hosts are deliberately KEPT here even though they were removed from
  // the search/probe lists: this allowlist governs what an already-saved entry
  // is allowed to be, and someone's library may still hold a series read on
  // one of them. Dropping a host here would delete their history; dropping it
  // from the probe list only stops us dialling a number that no longer rings.
  'mangadex.org', 'mangafire.to', 'asurascans.com', 'asura.gg', 'asuracomic.net',
  'asuratoon.com', 'weebcentral.com', 'mangapill.com', 'mangahub.io', 'bato.to',
  'batotoo.com', 'comick.io', 'comick.dev', 'natomanga.com', 'mangakakalot.com',
  'manganato.com', 'manganato.gg', 'chapmanganato.to', 'mangakatana.com',
  'manhuaplus.com', 'zinmanga.com', 'likemanga.io', 'aquamanga.com', 'toongod.org',
  'flamecomics.xyz', 'reaperscans.com', 'mangaread.org', 'mangapark.net',
  'mangago.me', 'mangasee123.com', 'mangafox.me', 'fanfox.net', 'mangadna.com',
  'mangaclash.com', 'nitroscans.com', 'cosmicscans.com',
  'mangabuddy.com', 'mangajar.com', 'mgeko.cc', 'novelcool.com',

  // Official / licensed platforms
  'viz.com', 'kmanga.kodansha.com', 'comikey.com', 'azuki.co', 'inkr.com',
  'webtoons.com', 'tapas.io', 'mangaplaza.com', 'coolmic.me', 'j-novel.club',
  'mangaplus.shueisha.co.jp', 'comic.pixiv.net', 'shonenjumpplus.com',
  'pocket.shonenmagazine.com', 'comic-days.com', 'comic-walker.com',
  'sunday-webry.com', 'ganganonline.com', 'tonarinoyj.jp', 'manga.line.me',
  'comico.jp', 'comic.naver.com', 'series.naver.com', 'page.kakao.com',
  'webtoon.kakao.com', 'ridibooks.com', 'ac.qq.com', 'manga.bilibili.com',
  'kuaikanmanhua.com', 'izneo.com', 'mangas.io',

  // Novels — the user counts these as library content
  'novelupdates.com', 'wuxiaworld.com', 'webnovel.com', 'royalroad.com',
  'scribblehub.com', 'lightnovelworld.com',
];

export function hostOf(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    // RN's URL is present, but a malformed href shouldn't throw into a caller
    // that is only trying to decide whether to save something.
    const m = /^https?:\/\/([^/?#]+)/i.exec(url || '');
    return m ? m[1].replace(/^www\./, '').toLowerCase() : '';
  }
}

// Is this URL on a site that publishes comics?
export function isReadingHost(url) {
  const host = hostOf(url);
  if (!host) return false;
  return READING_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

// Pages that live on a reading host but aren't a series: the homepage, search,
// browse, account and legal pages. Saving these produces entries named things
// like "Search results" or "Login".
const NON_SERIES_PATH_RE =
  /\/(search|filter|browse|genres?|tags?|login|register|signup|signin|account|profile|settings|bookmarks?|history|terms|privacy|dmca|contact|about|faq|support|donate|random|latest|popular|trending|completed|ongoing|rankings?)(\/|$|\?|#)/i;

export function isSeriesPage(url) {
  if (!isReadingHost(url)) return false;
  let path;
  try {
    path = new URL(url).pathname;
  } catch (_) {
    const m = /^https?:\/\/[^/]+([^?#]*)/i.exec(url || '');
    path = m ? m[1] : '';
  }
  if (!path || path === '/' || path === '') return false;
  if (NON_SERIES_PATH_RE.test(path)) return false;
  return true;
}

// ── Duplicate collapsing ───────────────────────────────────────────────────
// The reading history is keyed by searchKey, which is whatever title the site
// happened to print. Two sites naming the same series differently — "Demon
// Slayer" and "Demon Slayer: Kimetsu no Yaiba", "Solo Leveling" and "Solo
// Leveling (Official)" — therefore produced two Library cards for one series,
// each with its own cover and its own chapter count.
//
// The key is now the normalised head of the title: lowercased, punctuation
// stripped, and everything from a colon or dash onward dropped, because that
// is exactly where sites disagree. Volume/season suffixes go too.
//
// This deliberately does NOT merge on similarity. "Dragon Ball" and "Dragon
// Ball SD" stay separate, the same rule readSources.js uses for match
// evidence — collapsing genuinely different series is worse than a duplicate.
const SUFFIX_RE =
  /\s*(?:\((?:official|manga|manhwa|manhua|webtoon|novel|colou?red|remastered|uncensored)\)|\[(?:[^\]]*)\]|\b(?:season|s|vol|volume|part|arc)\.?\s*\d+\b)\s*$/gi;

export function libraryKey(title) {
  let s = String(title || '').toLowerCase().trim();
  // Head before a colon/en-dash/em-dash — the subtitle is the disputed part.
  s = s.split(/[:–—]/)[0];
  let prev;
  do { prev = s; s = s.replace(SUFFIX_RE, '').trim(); } while (s !== prev);
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// Collapses a history map/array down to one entry per series, keeping the most
// recently updated of each. Exported so both the writer and any existing
// polluted store can be cleaned with the same rule.
export function dedupeEntries(entries) {
  const byKey = new Map();
  for (const e of entries || []) {
    if (!e?.title) continue;
    const key = libraryKey(e.title);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || (e.updatedAt || 0) > (existing.updatedAt || 0)) {
      // Keep the longer title of the two: it's the one carrying the subtitle,
      // which reads better on a card than the truncated variant.
      const title = existing && String(existing.title).length > String(e.title).length
        ? existing.title
        : e.title;
      byKey.set(key, { ...e, title });
    }
  }
  return Array.from(byKey.values());
}
