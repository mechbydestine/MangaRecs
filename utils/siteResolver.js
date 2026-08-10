import { buildSearchUrl, getReadingSiteForLang } from './mangaSearch';

const _cache = {};

// ── Cross-site library import ───────────────────────────────────────────────
// Manually-triggered (not auto-detected — see ReaderScreen.js's
// startLibraryImport): the user taps "Import Library" while on a site with a
// config below, we navigate to that site's own bookmark/list page, and run
// its scrape script. If they aren't actually logged in, the scrape just finds
// 0 items and the user is told to log in first — no fragile "did they just
// log in" detection needed.
//
// Only Webtoon is implemented with real confidence (a large, stable site with
// a well-known URL pattern). This is NOT verified against a live logged-in
// session — there's no way to test that in the environment this was written
// in — so treat the exact listUrl/scrape selectors as a first draft to
// confirm against a real account before trusting the results. Add more sites
// here once their real bookmark-page structure has actually been checked
// live; guessing at aggregator sites' markup (which changes far more often
// than Webtoon's) risks scraping garbage with high confidence, which is worse
// than not having the feature — see mangarecs-project-state memory's account
// of the 9,069-row junk-scrape incident for why that risk is taken seriously
// here.
export const LIBRARY_IMPORT_SITES = {
  'webtoons.com': {
    name: 'Webtoon',
    listUrl: 'https://www.webtoons.com/en/member/bookmark',
    scrapeScript: `
(function() {
  try {
    var seen = {};
    var results = [];
    // Webtoon's series-home URL (/list?title_no=N) is a stable, long-standing
    // pattern independent of whatever CSS classes the bookmark page's markup
    // currently uses — more resilient to a template redesign than targeting
    // specific class names would be.
    document.querySelectorAll('a[href*="/list?title_no="]').forEach(function(a) {
      var m = a.href.match(/title_no=(\\d+)/);
      if (!m) return;
      var titleNo = m[1];
      if (seen[titleNo]) return;
      seen[titleNo] = true;
      var img = a.querySelector('img');
      var title = (img && img.alt ? img.alt : a.textContent).trim();
      if (!title) return;
      results.push({ id: 'webtoon_' + titleNo, title: title });
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'libraryImportResult', items: results }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'libraryImportResult', items: [], error: String(e) }));
  }
})();
true;
`,
  },
};

export function getLibraryImportConfig(url) {
  if (!url) return null;
  let hostname;
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  return Object.entries(LIBRARY_IMPORT_SITES).find(
    ([host]) => hostname === host || hostname.endsWith('.' + host)
  )?.[1] || null;
}

export function clearResumeCache(title) {
  Object.keys(_cache).forEach((k) => { if (k.startsWith(title + '::')) delete _cache[k]; });
}

// ── Slug builder + direct-URL map ───────────────────────────────────────────
// For Madara/WordPress sites the manga lives at /{prefix}/{slug}/.
// Going there directly is faster and avoids search-page Cloudflare challenges.
// If the slug 404s, SEARCH_WATCHDOG_JS fires and we fall through to AJAX then search.
function buildSlug(title) {
  // eslint-disable-next-line no-control-regex
  const diacriticRe = /[̀-ͯ]/g;
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(diacriticRe, '')
    .replace(/[''""`'"]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

const SLUG_BUILDERS = {
  'asurascans.com':  (s, b) => `${b}/manga/${s}/`,
  'asura.gg':        (s, b) => `${b}/manga/${s}/`,
  'asuracomic.net':  (s, b) => `${b}/manga/${s}/`,
  'asuratoon.com':   (s, b) => `${b}/manga/${s}/`,
  'weebcentral.com': (s, b) => `${b}/series/${s}`,
  'manganato.gg':    (s, b) => `${b}/manga/${s}`,
  // Removed 2026-08-10: zinmanga.com, likemanga.io and aquamanga.com no longer
  // resolve at all, and manhuaplus.com's /manga/{slug}/ 404s (its permalinks
  // moved) — a direct URL that 404s costs a load plus the watchdog before the
  // chain advances, which is slower than going straight to search.
};

export function buildDirectUrl(siteUrl, title) {
  if (!siteUrl || !title) return null;
  const domain = siteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const entry = Object.entries(SLUG_BUILDERS).find(([key]) => domain.includes(key));
  if (!entry) return null;
  const base = siteUrl.replace(/\/$/, '');
  return entry[1](buildSlug(title), base);
}

const MADARA_PATHS = {
  'asurascans.com':  'manga',
  'asura.gg':        'manga',
  'asuracomic.net':  'manga',
  'asuratoon.com':   'manga',
  'weebcentral.com': 'series',
  // manhuaplus.com stays listed so fetchMadaraUrl() can still ask its AJAX
  // endpoint for the real permalink — it is only the guessed /manga/{slug}/
  // URL above that was wrong.
  'manhuaplus.com':  'manga',
};


const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

export async function fetchMangaHubUrl(title) {
  const query = `{ search(x: mn01, q: ${JSON.stringify(title)}, genre: "all", mod: TRENDING, count: false, offset: 0) { rows { id title slug } } }`;
  try {
    const resp = await withTimeout(
      fetch('https://api.mangahub.io/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mhub-access': 'mn01',
          origin: 'https://mangahub.io',
          referer: 'https://mangahub.io/',
        },
        body: JSON.stringify({ query }),
      }),
      5000
    );
    if (!resp?.ok) return null;
    const json = await resp.json();
    const rows = json?.data?.search?.rows;
    if (!rows?.length) return null;
    const q = title.toLowerCase();
    const best =
      rows.find((r) => (r.title || '').toLowerCase() === q) ||
      rows.find((r) => (r.title || '').toLowerCase().startsWith(q)) ||
      rows[0];
    return best?.slug ? `https://mangahub.io/manga/${best.slug}` : null;
  } catch (_) {
    return null;
  }
}

// Uses Madara/WordPress AJAX search to get the exact manga page URL.
// Much more reliable than slug-guessing — returns the real permalink from the site's own DB.
export async function fetchMadaraUrl(siteUrl, title) {
  if (!siteUrl) return null;
  const domain = siteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  if (!Object.keys(MADARA_PATHS).some((k) => domain.includes(k))) return null;
  try {
    const base = siteUrl.replace(/\/$/, '');
    const resp = await withTimeout(
      fetch(`${base}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: `action=wp-manga-search-manga&title=${encodeURIComponent(title)}`,
      }),
      5000
    );
    if (!resp?.ok) return null;
    const json = await resp.json();
    if (!json?.success || !json?.data?.length) return null;
    const q = title.toLowerCase();
    const best =
      json.data.find((r) => (r.title || r.post_title || '').toLowerCase() === q) ||
      json.data.find((r) => (r.title || r.post_title || '').toLowerCase().includes(q.split(' ')[0])) ||
      json.data[0];
    return best?.url || best?.permalink || null;
  } catch (_) {
    return null;
  }
}

// Fires 'searchFailed' if the page is a 404, 403, bot-block, or other hard error.
// Does NOT fire on valid search pages — AUTO_NAV_SEARCH_JS handles the no-results case.
// Cloudflare challenge pages get up to ~9s before we give up (they typically auto-redirect in 5s).
export const SEARCH_WATCHDOG_JS = `
(function() {
  if (window.__mangarecs404) return true;
  window.__mangarecs404 = true;
  var cfStrikes = 0;
  function check() {
    if (window.__mangarecsNavDone) return;
    var t = (document.title || '').toLowerCase();
    var u = window.location.href.toLowerCase();
    var b = document.body ? (document.body.innerText || '').substring(0, 2000).toLowerCase() : '';
    // Cloudflare / bot-challenge: give the page more time to auto-pass, don't immediately fail
    var isChallenge = /just a moment/i.test(t) || /checking your browser/i.test(t) ||
                      /ddos.?protection/i.test(t) || /attention required/i.test(t) ||
                      /verify you are human/i.test(b) || /complete the captcha/i.test(b);
    if (isChallenge) {
      cfStrikes++;
      if (cfStrikes < 4) return; // allow up to 4 checks (~9s total) — Cloudflare 5s auto-challenge needs this room
    }
    var isBad =
      // 404 patterns
      /\\b404\\b/.test(t) ||
      /not found/i.test(t) ||
      /nothing found/i.test(t) ||
      /page not found/i.test(t) ||
      /can.?t be found/i.test(t) ||
      /doesn.?t exist/i.test(t) ||
      /no longer exist/i.test(t) ||
      /oops.*went wrong/i.test(t) ||
      /something went wrong/i.test(t) ||
      /\\/404[/?#]/.test(u) ||
      /\\/not-found/.test(u) ||
      /\\/error[/?#]/.test(u) ||
      (/\\b404\\b/.test(b) && /not found/i.test(b)) ||
      // 403 / bot-block / Cloudflare / region block patterns
      /\\b403\\b/.test(t) ||
      /forbidden/i.test(t) ||
      /access denied/i.test(t) ||
      /\\bblocked\\b/i.test(t) ||
      isChallenge ||
      /unavailable.*region/i.test(b) ||
      /not available.*country/i.test(b) ||
      /not available in your (region|country|area)/i.test(b) ||
      /this content is (geo|region)/i.test(b) ||
      (/cloudflare/i.test(b) && /sorry/i.test(b)) ||
      /enable javascript.*to continue/i.test(b) ||
      (/\\b403\\b/.test(b) && /forbidden/i.test(b)) ||
      // Manga Plus specific — region lock overlay
      /this title is not available in your region/i.test(b) ||
      /available in.*only/i.test(b) ||
      // Generic "something broke" patterns
      /we.?re sorry.*error/i.test(b) ||
      /internal server error/i.test(b) ||
      /service unavailable/i.test(b) ||
      /bad gateway/i.test(b) ||
      /gateway timeout/i.test(b);
    if (isBad && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'searchFailed' }));
    }
  }
  // First quick check at 200ms catches fast-responding error pages before the user sees them
  setTimeout(check, 200);
  setTimeout(check, 2500);
  setTimeout(check, 5500);
  setTimeout(check, 9000);
  setTimeout(check, 12000);
  true;
})();
`;

// Fires 'blankPage' when a load finished but painted nothing.
//
// A page that renders empty is normally a load that got aborted part-way —
// most often because a second navigation landed on top of the first. The
// WebView reports that as ERR_ABORTED, which is deliberately ignored (it's
// benign in every other case), so nothing recovers and the user is left
// staring at white until they reload by hand. This is the safety net for that:
// it reports the empty document and the native side reloads once.
//
// The bar for "blank" is deliberately high — no meaningful text AND no visual
// element of any kind — so a legitimately sparse page never trips it.
export const BLANK_PAGE_WATCHDOG_JS = `
(function() {
  if (window.__inkloreBlankWatch) return true;
  window.__inkloreBlankWatch = true;
  var fired = false;
  function check() {
    if (fired) return;
    var b = document.body;
    if (!b) return;
    var text = (b.innerText || '').trim();
    if (text.length >= 40) { fired = true; return; }
    if (b.querySelector('img, canvas, video, svg, picture, iframe')) { fired = true; return; }
    // A body that has laid out real height is rendering something we simply
    // can't read as text (background images, custom elements) — leave it be.
    if ((b.scrollHeight || 0) > window.innerHeight * 0.6) { fired = true; return; }
    fired = true;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blankPage', url: window.location.href }));
    }
  }
  setTimeout(check, 1400);
  setTimeout(check, 4000);
  true;
})();
`;

// Fires 'siteHomepage' when the search URL redirected to the site root.
export const HOMEPAGE_DETECT_JS = `
(function() {
  var path = window.location.pathname;
  var qs   = window.location.search;
  var isHome = (path === '/' || path === '') &&
    !/[?&](s|q|search|keyword|query|term|name)=/.test(qs);
  if (isHome && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'siteHomepage' }));
  }
  true;
})();
`;

// Auto-clicks the first real manga result on a search/filter page.
// Keeps retrying for ~9 seconds via MutationObserver + interval.
// If exhausted with no result, sends 'searchFailed' to trigger the fallback chain.
export const AUTO_NAV_SEARCH_JS = `
(function() {
  if (window.__mangarecsAuto) return true;
  window.__mangarecsAuto = true;
  var url = window.location.href;
  if (!/[?&](s|q|search|keyword|query|term|name|word)=|\/search[/?#]|\/filter[/?#]/.test(url)) return true;

  var SELS = [
    // Webtoon — series links always contain title_no; works across all layout changes
    'a[href*="title_no="]',
    '._item a[href]', '.card_wrap a[href]', '.card_item a[href]',
    // MangaFire — relative href starting with /manga/ and containing the .HASH suffix
    // Using ^= (starts-with) to avoid matching absolute nav links where dot is in the domain
    'a[href^="/manga/"][href*="."]',
    // MangaFire filter/search result containers (more specific than generic .unit)
    '.filter-list .unit a[href^="/manga/"]',
    '.list-wrap .unit a[href^="/manga/"]',
    '.manga-list-wrap .unit a[href^="/manga/"]',
    // MangaFire card layouts (less specific, runs after targeted ones)
    '.original.card-lg .unit a[href]', '.item .cover a[href]',
    '.card-lg a[href^="/manga/"]', '.unit a[href^="/manga/"]',
    '.manga-list .item a[href]', '.manga-item a[href^="/manga/"]',
    // Madara / WordPress (Asura Scans, ManhuaPlus, Weeb Central, etc.)
    '.c-tabs-item__content .c-image-hover a[href]',
    '.page-item-detail .item-thumb a[href]',
    '.tab-touch-item .tab-thumb a[href]',
    '.post-title h3 a[href]',
    '.bsx > a[href]',
    '.listupd .bs a[href]',
    '.bs .bsx a[href]',
    // Weeb Central specific
    '.series a[href*="/series/"]',
    'a[href*="/series/"][class]',
    // Manganato / MangaKatana
    '.searchResultList li a[href]',
    '.search-story-item a[href]',
    // MangaHub
    '.manga-item a[href]', '.unit .manga a[href]',
    // bato.to
    '.item-title a[href]', 'div.item a[href]',
    // Toongod / Korean scanlation sites
    '.entry-title a[href]', '.toon-img a[href]', '.search-item a[href]',
    // Generic
    '.item-thumb a[href]',
    'article h3 a[href]',
    'h2.h5 a[href]',
    '.manga_name a[href]',
    '.series-title a[href]',
    '.comic-item a[href]',
  ];

  var BROWSE_SLUG = /^(all|list|latest|new|popular|trending|completed|ongoing|genres?|tags?|hot|search|filter|browse|random|recent|top|rank)$/i;
  function isValidMangaHref(href) {
    if (!href || !/^https?:/.test(href)) return false;
    if (/\/search[/?#]|\/filter[/?#]|\/login|\/register|\/signup/.test(href)) return false;
    var m = /\\/(manga|comics?|series|manhwa|manhua|title|webtoon|novel|read)\\/([^/?#]+)/i.exec(href);
    if (m) {
      var slug = m[2];
      return slug.length >= 3 && !BROWSE_SLUG.test(slug);
    }
    // bato.to: /series/12345/slug
    if (/\\/series\\/\\d+/.test(href)) return true;
    // Deep paths (3+ segments): Webtoon /en/genre/title/, Toongod, etc.
    var pm = /^https?:\\/\\/[^/]+(\\/[^?#]+)/.exec(href);
    if (pm) {
      var parts = pm[1].replace(/\\/$/, '').split('/').filter(Boolean);
      if (parts.length >= 3) {
        var hasSlug = parts.some(function(p) {
          return p.length >= 5 && (p.indexOf('-') !== -1 || p.length >= 12) && !BROWSE_SLUG.test(p);
        });
        return hasSlug && !/(search|filter|browse|login|register|signup)/.test(pm[1]);
      }
    }
    return false;
  }

  function tryNav() {
    for (var i = 0; i < SELS.length; i++) {
      var el = document.querySelector(SELS[i]);
      if (el && isValidMangaHref(el.href)) {
        window.__mangarecsNavDone = true;
        el.click();
        return true;
      }
    }
    // Generic fallback: prefer links whose href slug or text matches the search query.
    // Re-read __mangarecsQuery on every call because the query injection may arrive
    // slightly after this script runs (first interval tick gives it time to land).
    var rawQ = (window.__mangarecsQuery || '').toLowerCase();
    var qSlug = rawQ.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var links = document.querySelectorAll('a[href]');
    var firstValid = null;
    var titleMatch = null;
    for (var j = 0; j < links.length; j++) {
      var lHref = links[j].href || '';
      if (!isValidMangaHref(lHref)) continue;
      if (!firstValid) firstValid = links[j];
      if (!titleMatch && qSlug.length >= 3) {
        var hlow = lHref.toLowerCase();
        var tlow = (links[j].textContent || '').trim().toLowerCase();
        if (hlow.indexOf(qSlug) !== -1 || tlow.indexOf(rawQ) !== -1) {
          titleMatch = links[j];
        }
      }
    }
    var picked = titleMatch || firstValid;
    if (picked) {
      window.__mangarecsNavDone = true;
      picked.click();
      return true;
    }
    return false;
  }

  if (tryNav()) return true;

  var done = false;
  var obs = new MutationObserver(function() {
    if (!done && tryNav()) { done = true; obs.disconnect(); }
  });
  try { obs.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch(e) {}

  // Retry for ~9 seconds; if the page has no valid results, signal the fallback chain
  var n = 0;
  var iv = setInterval(function() {
    n++;
    if (done) { clearInterval(iv); obs.disconnect(); return; }
    if (tryNav()) { done = true; clearInterval(iv); obs.disconnect(); return; }
    if (n >= 15) {
      clearInterval(iv);
      obs.disconnect();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'searchFailed' }));
      }
    }
  }, 600);

  true;
})();
`;

// Auto-clicks the first chapter on a MangaDex title page (/title/{uuid}).
// Self-guards — does nothing on any other page.
export const MANGADEX_CHAPTER_NAV_JS = `
(function() {
  if (window.__mangarecsChapNav) return true;
  if (!/\/title\/[a-f0-9-]+/i.test(window.location.pathname)) return true;
  window.__mangarecsChapNav = true;

  function tryClick() {
    var links = Array.from(document.querySelectorAll('a[href*="/chapter/"]'));
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href;
      if (/\/chapter\/[a-f0-9-]{32,}/i.test(href)) {
        window.__mangarecsNavDone = true;
        links[i].click();
        return true;
      }
    }
    return false;
  }

  if (tryClick()) return true;

  var n = 0;
  var obs = new MutationObserver(function() { if (tryClick()) { obs.disconnect(); } });
  try { obs.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch(e) {}
  var iv = setInterval(function() {
    n++;
    if (tryClick()) { clearInterval(iv); obs.disconnect(); return; }
    if (n >= 20) {
      clearInterval(iv);
      obs.disconnect();
      // No readable chapters found on this title page — signal fallback chain
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'searchFailed' }));
      }
    }
  }, 400);

  true;
})();
`;

// After AUTO_NAV lands us on a manga detail page (not a search page, not a chapter reader),
// auto-click the first listed chapter so the user goes straight into reading.
export const AUTO_NAV_CHAPTER_JS = `
(function() {
  if (window.__mangarecsChapClick) return true;
  window.__mangarecsChapClick = true;

  var url = window.location.href;
  // Skip: search pages, homepage, pages we're already reading
  if (/[?&](s|q|search|keyword|query|term|name|word)=|\/search[/?#]|\/filter[/?#]/.test(url)) return true;
  if (/\/chapter\//i.test(url)) return true;
  if (/[?&]episode_no=/.test(url)) return true;  // already on a Webtoon episode
  // Skip MangaFire reader pages: /read/{slug}/{lang}/chapter-N
  if (/\/read\/[^/]+\/[a-z]{2,}\/chapter/i.test(url)) return true;
  var path = window.location.pathname;
  if (!path || path === '/' || path === '') return true;
  // Must look like a manga/series detail page.
  // Also allow Webtoon list pages: /en/{genre}/{slug}/list?title_no=NNN
  var isMangaPage = /\/(manga|comics?|series|manhwa|manhua|title|webtoon|novel|read|book)\//i.test(url) ||
                    (/webtoons\.com\/.+\/list/.test(url) && /[?&]title_no=\d+/.test(url));
  if (!isMangaPage) return true;

  var SELS = [
    // Webtoon: episode 1 selector — placed first so min-scan almost always picks it immediately
    'a[href*="episode_no=1"]',
    // Webtoon episodes — URL always contains episode_no, works regardless of layout
    'a[href*="episode_no="]',
    // Webtoons (desktop + mobile layout class names)
    '._episodeItem a[href]', '.detail_lst li a[href]', 'ul._listWrap li a[href]',
    '#_listWrap li a[href]', '.EpisodeListView__episode[href]', '.episode_item a[href]',
    // MangaFire — chapter links go to /read/{slug}/{lang}/chapter-N
    'a[href*="/read/"][href*="chapter"]',
    'ul[id$="-chapters"] a[href]',
    '#chapters a[href*="/read/"]',
    '.chapter-list .chapter-item a[href]', '.chapter-item a[href]', '.episode-item a[href]',
    '.volume-list .chapter-item a[href]', 'a.chapter-item[href]',
    // Madara/WordPress (Asura, Weeb Central, ManhuaPlus, Zinmanga, etc.)
    '.wp-manga-chapter a[href]', '.listing-chapters_wrap li a[href]', '.eplister li a[href]',
    '.chapter-li a[href]',
    // Manganato / MangaKatana
    '.row-content-chapter li a[href]', '.chapter-list .row a[href]',
    // MangaHub
    '.chapter-list-item a[href]',
    // bato.to
    '.chapter-list a[href]',
    // Generic
    '.chapters-list li a[href]', '.chapter-feed a[href]',
    'li.chapter a[href]', '.chapters li a[href]',
  ];

  function isChapterHref(href) {
    if (!href || !/^https?:/.test(href)) return false;
    if (/[?&]episode_no=\d+/.test(href)) return true;   // Webtoon episode
    // MangaFire: /read/{slug}/{lang}/chapter-N
    if (/\/read\/[^/]+\/[a-z]{2,}\/chapter/i.test(href)) return true;
    return /\/(chapter|ch|episode|ep)[\/-]/i.test(href) || /\/chapter\/[a-f0-9-]{32,}/i.test(href);
  }

  function chapterNum(href) {
    var ep = /[?&]episode_no=(\d+)/.exec(href);
    if (ep) return parseInt(ep[1], 10);
    // MangaFire: /read/slug/en/chapter-139 → extract 139
    var mf = /\/chapter-(\d+(?:\.\d+)?)/i.exec(href);
    if (mf) return parseFloat(mf[1]);
    var m = /(chapter|ch|episode|ep)[-_\/]?(\d+(?:\.\d+)?)/i.exec(href);
    return m ? parseFloat(m[2]) : 9999;
  }

  function tryClick() {
    var best = null, bestNum = Infinity;
    // Scan all matches from every targeted selector, keep lowest chapter number.
    // Using querySelectorAll (not querySelector) so descending chapter lists
    // (Asura Scans, ManhuaPlus, MangaFire, etc.) don't land on the latest chapter.
    for (var i = 0; i < SELS.length; i++) {
      var els = document.querySelectorAll(SELS[i]);
      for (var j = 0; j < els.length; j++) {
        var selHref = els[j].href || '';
        if (!isChapterHref(selHref)) continue;
        var selN = chapterNum(selHref);
        if (selN < bestNum) { bestNum = selN; best = els[j]; }
      }
    }
    // Generic fallback: scan every link if targeted selectors found nothing
    if (!best) {
      var links = document.querySelectorAll('a[href]');
      for (var k = 0; k < links.length; k++) {
        var gHref = links[k].href || '';
        if (!isChapterHref(gHref)) continue;
        var gN = chapterNum(gHref);
        if (gN < bestNum) { bestNum = gN; best = links[k]; }
      }
    }
    if (best) {
      window.__mangarecsNavDone = true;
      best.click();
      return true;
    }
    return false;
  }

  if (tryClick()) return true;

  var attempts = 0;
  var obs = new MutationObserver(function() { if (tryClick()) { obs.disconnect(); clearInterval(iv); } });
  try { obs.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch(e) {}
  var iv = setInterval(function() {
    attempts++;
    if (tryClick()) { clearInterval(iv); obs.disconnect(); return; }
    if (attempts >= 20) { clearInterval(iv); obs.disconnect(); }
  }, 500);

  true;
})();
`;

export async function resolveMangaUrl(title, { defaultSiteUrl, mangaDexUrl, mangaHubUrl, madaraUrl, lang } = {}) {
  const cacheKey = `${title}::${defaultSiteUrl || ''}`;
  if (_cache[cacheKey] !== undefined) return _cache[cacheKey];
  const store = (r) => { _cache[cacheKey] = r; return r; };

  const isDex    = defaultSiteUrl?.includes('mangadex.org');
  const isHub    = defaultSiteUrl?.includes('mangahub.io');
  const isMadara = defaultSiteUrl
    ? Object.keys(MADARA_PATHS).some((k) => defaultSiteUrl.includes(k))
    : false;
  const hubUrl = mangaHubUrl !== undefined ? mangaHubUrl : await fetchMangaHubUrl(title);

  let primaryUrl;
  const fallbacks = [];

  if (isMadara) {
    // Direct slug URL → AJAX permalink → search page
    // Direct URL is the fastest path and avoids Cloudflare challenge pages on search.
    const directUrl = buildDirectUrl(defaultSiteUrl, title);
    if (directUrl) {
      primaryUrl = directUrl;
      if (madaraUrl && madaraUrl !== directUrl) fallbacks.push(madaraUrl);
      fallbacks.push(buildSearchUrl(defaultSiteUrl, title));
    } else if (madaraUrl) {
      primaryUrl = madaraUrl;
      fallbacks.push(buildSearchUrl(defaultSiteUrl, title));
    } else {
      primaryUrl = buildSearchUrl(defaultSiteUrl, title);
    }
  } else if (isDex) {
    primaryUrl = mangaDexUrl || `https://mangadex.org/search?q=${encodeURIComponent(title)}`;
  } else if (isHub) {
    primaryUrl = hubUrl || buildSearchUrl(defaultSiteUrl, title);
  } else if (defaultSiteUrl) {
    primaryUrl = buildSearchUrl(defaultSiteUrl, title);
  } else {
    primaryUrl = mangaDexUrl || hubUrl || `https://mangadex.org/search?q=${encodeURIComponent(title)}`;
  }

  const has = (host) => primaryUrl.includes(host) || fallbacks.some((f) => f.includes(host));

  // Helper: push direct URL + search URL for a site, but only if the site isn't
  // already covered (either as primary or in the chain).
  function pushSite(siteUrl, searchUrl) {
    const dom = siteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    if (has(dom)) return; // site already has coverage — skip duplicates
    const direct = buildDirectUrl(siteUrl, title);
    if (direct) fallbacks.push(direct); // try direct slug first
    fallbacks.push(searchUrl);           // then search as fallback
  }

  if (mangaDexUrl && !has('mangadex.org')) fallbacks.push(mangaDexUrl);
  else if (!has('mangadex.org')) fallbacks.push(`https://mangadex.org/search?q=${encodeURIComponent(title)}`);

  return store({ url: primaryUrl, fallbacks });
}
