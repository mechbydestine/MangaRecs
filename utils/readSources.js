// Per-title reading sources for the Manga Detail screen.
//
// One rule: a site is listed only if we have established that it carries THIS
// series, and the link opens the series. Nothing is listed on the strength of
// "this site has a search box". That means the row is often short — three
// sources, sometimes one, sometimes none — and that is the correct outcome.
// Padding it out with search links for sites that don't carry the title is
// what this module exists to prevent (Dragon Ball is not on WEBTOON).
//
// Availability comes from two kinds of evidence, both equally trusted:
//
//   metadata — MangaDex's moderator-kept `links` map and AniList's curated
//     externalLinks. Both are per-title and both hand back a real URL.
//
//   probe — the site's own search API/page, queried directly, accepted only
//     when a result's title actually matches ours. A probe that times out,
//     404s, gets Cloudflared, or returns near-misses yields nothing, and the
//     site simply isn't listed.
//
// Storefronts are excluded outright. Amazon, BOOK☆WALKER and eBookJapan sell
// volumes; this row is for reading.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentLanguage, normalizeLangName, DEFAULT_APP_LANG } from './language';

export const MAX_SOURCES = 10;

const PROBE_TIMEOUT = 5000;
const CACHE_PFX = '@mangarecs/sources_v1/';
const CACHE_TTL = 12 * 60 * 60 * 1000;

// ── Official / licensed reading platforms ──────────────────────────────────
// Allowlist, not a lookup table: AniList returns wikis, retailers and personal
// sites alongside the real ones, and anything not named here is dropped rather
// than shown as somewhere to read. Deliberately contains no storefronts.
//
// `langs` is what the site publishes IN. It's what stops a Japanese-only
// magazine site appearing for an English reader, and vice versa. `'any'` means
// the site is genuinely multilingual and belongs in every reader's list.
const OFFICIAL_HOSTS = {
  // English
  'viz.com':                  { name: 'VIZ',            langs: ['en'] },
  'kmanga.kodansha.com':      { name: 'K MANGA',        langs: ['en'] },
  'comikey.com':              { name: 'Comikey',        langs: ['en', 'es'] },
  'azuki.co':                 { name: 'Azuki',          langs: ['en'] },
  'inkr.com':                 { name: 'INKR',           langs: ['en'] },
  'comics.inkr.com':          { name: 'INKR',           langs: ['en'] },
  'webtoons.com':             { name: 'WEBTOON',        langs: ['en', 'es', 'fr', 'zh'] },
  'tapas.io':                 { name: 'Tapas',          langs: ['en'] },
  'mangaplaza.com':           { name: 'MangaPlaza',     langs: ['en'] },
  'coolmic.me':               { name: 'Coolmic',        langs: ['en'] },
  'j-novel.club':             { name: 'J-Novel Club',   langs: ['en'] },
  // MANGA Plus publishes simultaneously in several languages, which is the
  // whole point of it.
  'mangaplus.shueisha.co.jp': { name: 'MANGA Plus',     langs: ['en', 'es', 'fr'] },
  // Japanese
  'comic.pixiv.net':          { name: 'Pixiv Comics',   langs: ['ja'] },
  'shonenjumpplus.com':       { name: 'Jump+',          langs: ['ja'] },
  'pocket.shonenmagazine.com':{ name: 'Magazine Pocket',langs: ['ja'] },
  'comic-days.com':           { name: 'Comic Days',     langs: ['ja'] },
  'comic-walker.com':         { name: 'Comic Walker',   langs: ['ja'] },
  'sunday-webry.com':         { name: 'Sunday Webry',   langs: ['ja'] },
  'ganganonline.com':         { name: 'Gangan Online',  langs: ['ja'] },
  'tonarinoyj.jp':            { name: 'Tonari no YJ',   langs: ['ja'] },
  'manga.line.me':            { name: 'LINE Manga',     langs: ['ja'] },
  'comico.jp':                { name: 'comico',         langs: ['ja'] },
  // Korean
  'comic.naver.com':          { name: 'Naver Webtoon',  langs: ['ko'] },
  'series.naver.com':         { name: 'Naver Series',   langs: ['ko'] },
  'page.kakao.com':           { name: 'KakaoPage',      langs: ['ko'] },
  'webtoon.kakao.com':        { name: 'Kakao Webtoon',  langs: ['ko'] },
  'ridibooks.com':            { name: 'RIDI',           langs: ['ko'] },
  // Chinese
  'ac.qq.com':                { name: 'Tencent Comics', langs: ['zh'] },
  'manga.bilibili.com':       { name: 'Bilibili Manga', langs: ['zh'] },
  'kuaikanmanhua.com':        { name: 'Kuaikan',        langs: ['zh'] },
  // French
  'izneo.com':                { name: 'izneo',          langs: ['fr'] },
  'mangas.io':                { name: 'Mangas.io',      langs: ['fr'] },
};

// Hosts that are shops, however official. Dropped even when MangaDex or
// AniList hands us a verified link to them.
const STORE_HOSTS = [
  'amazon.', 'bookwalker.jp', 'ebookjapan.yahoo.co.jp', 'cdjapan.co.jp',
  'yenpress.com', 'sevenseasentertainment.com', 'kodansha.us', 'rightstufanime.com',
  'barnesandnoble.com', 'kobo.com', 'apple.com', 'google.com/store',
];

function isStore(host) {
  return STORE_HOSTS.some((s) => (host || '').includes(s));
}

// ── Title matching ─────────────────────────────────────────────────────────
// The whole module rests on this. A loose match means listing a site that
// carries a *different* series with a similar name, which is exactly the
// failure this is meant to eliminate — so near-misses are rejected.

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function buildTitleMatcher(names) {
  return makeMatcher(names);
}

function makeMatcher(names) {
  // Exact equality only, against every title we know for the series. A
  // prefix/length-ratio rule was tried first and was measurably wrong: it
  // matched "Dragon Ball SD" (a spin-off) for "Dragon Ball", because three
  // extra characters sit well inside any sane ratio. On a row whose whole
  // claim is "this site has this series", a near-miss is a false statement,
  // so the only accepted evidence is the same title.
  //
  // Alt titles carry the legitimate variants, plus the part before a colon —
  // sites disagree constantly about whether the subtitle belongs in the name
  // ("Demon Slayer" vs "Demon Slayer: Kimetsu no Yaiba").
  const known = new Set();
  for (const n of names) {
    if (!n) continue;
    const full = norm(n);
    if (full.length >= 2) known.add(full);
    const head = norm(String(n).split(/[:–—]/)[0]);
    if (head.length >= 4) known.add(head);
  }
  return function matches(candidate) {
    const c = norm(candidate);
    if (!c) return false;
    if (known.has(c)) return true;
    const head = norm(String(candidate).split(/[:–—]/)[0]);
    return head.length >= 4 && known.has(head);
  };
}

// ── Fetch helpers ──────────────────────────────────────────────────────────

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

// A real browser UA matters more than it looks: without one the default is a
// runtime string ("node", "okhttp/…") that bot filters reject on sight, which
// is enough on its own to make a site look like it has no results.
const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function getText(url, extraHeaders) {
  try {
    const resp = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...extraHeaders,
        },
      }),
      PROBE_TIMEOUT
    );
    if (!resp?.ok) return null;
    return await resp.text();
  } catch (_) {
    return null;
  }
}

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}

// Walks a search page's result links and returns the first whose visible text
// matches. Returns null rather than "the first result" — an unmatched first
// result is precisely the wrong series.
function firstMatchingLink(html, linkRe, origin, matches) {
  if (!html) return null;
  let m;
  linkRe.lastIndex = 0;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const label = stripTags(m[2]);
    if (!href || !label) continue;
    if (!matches(label)) continue;
    return href.startsWith('http') ? href : origin + href;
  }
  return null;
}

// ── Community-source probes ────────────────────────────────────────────────
//
// Only sites that answer a plain fetch with server-rendered results can be
// probed, and that rules out most aggregators. Checked live while writing
// this, against real queries:
//
//   MangaFire   SPA shell — the filter page returns ~3KB of bootstrap and
//               renders results client-side. Nothing to read.
//   Asura Scans /browse?name= ignores the filter server-side and returns the
//               default listing, so any "match" would be a different series.
//   Bato.to     domain no longer resolves.
//   MangaHub    GraphQL endpoint dead; the site itself is Cloudflare-gated.
//   Comick / Natomanga / MangaKakalot   Cloudflare interstitial on every hit.
//
// Those still work in the reader, because a WebView runs JS and clears the
// challenge — they're in the Read button's fallback chain. They just can't be
// confirmed from here, and listing an unconfirmed site is the thing this row
// is meant not to do.
//
// Both probes below scrape markup that can change without notice. The failure
// mode is deliberately "site not listed", never "listed with a wrong link".

async function probeWeebCentral(query, matches) {
  // The visible /search?term= page is only the form; results come from this
  // endpoint, which its own search box calls via htmx.
  const url = 'https://weebcentral.com/search/data'
    + `?author=&text=${encodeURIComponent(query)}`
    + '&sort=Best+Match&order=Descending&official=Any&display_mode=Full+Display';
  const html = await getText(url);
  return firstMatchingLink(
    html,
    /<a\b[^>]*href="(https:\/\/weebcentral\.com\/series\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g,
    'https://weebcentral.com',
    matches
  );
}

async function probeMangaPill(query, matches) {
  const html = await getText(`https://mangapill.com/search?q=${encodeURIComponent(query)}`);
  return firstMatchingLink(
    html,
    /<a\b[^>]*href="(\/manga\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g,
    'https://mangapill.com',
    matches
  );
}

// Added 2026-08-10. Both were audited live and answer a plain fetch with
// server-rendered results containing the query — the same bar Weeb Central and
// MangaPill clear. Worth having as fetch probes specifically because a fetch
// costs a fraction of a WebView lane, so these two widen the row without
// competing for the three lanes SourceProbe runs.
async function probeMangaKatana(query, matches) {
  const html = await getText(
    `https://mangakatana.com/?search=${encodeURIComponent(query)}&search_by=book_name`
  );
  return firstMatchingLink(
    html,
    /<a\b[^>]*href="(https:\/\/mangakatana\.com\/manga\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g,
    'https://mangakatana.com',
    matches
  );
}

async function probeFanfox(query, matches) {
  const html = await getText(`https://fanfox.net/search?title=${encodeURIComponent(query)}`);
  return firstMatchingLink(
    html,
    /<a\b[^>]*href="(\/manga\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g,
    'https://fanfox.net',
    matches
  );
}

// ── Asura Scans ────────────────────────────────────────────────────────────
// Asura has no usable search: every search URL it exposes returns the entire
// catalogue unfiltered (verified byte-for-byte against its homepage), because
// the site is a Next.js app that filters client-side. That made it the one
// source that could never be confirmed, and — before the auto-nav title guard
// — the one that would happily open a different series.
//
// It does have a public JSON API behind api.asurascans.com, and it answers a
// slug lookup directly. Slugging the title and asking for that one series is a
// single request that returns the exact hashed web URL in `public_url`, which
// is otherwise unguessable (/comics/solo-leveling-7e1f454a).
//
// Checked against eight titles: every one Asura actually carries resolved on
// the first try, and the three that missed were genuinely absent from its
// 400-series catalogue rather than slugged differently. The catalogue could be
// walked instead, but that is 21 pages and about a megabyte to answer one
// question — the slug lookup is ~50x cheaper and was not measurably worse.
function asuraSlug(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function probeAsura(query, matches) {
  const slug = asuraSlug(query);
  if (slug.length < 2) return null;
  const raw = await getText(`https://api.asurascans.com/api/series/${slug}`, {
    Accept: 'application/json',
  });
  if (!raw) return null;
  let series;
  try { series = JSON.parse(raw)?.series; } catch (_) { return null; }
  if (!series?.public_url) return null;
  // A slug guess can land on a real but different series, so the answer is
  // still checked against every name Asura knows for it — the API returns a
  // long alt_titles list, which is exactly what makes this reliable.
  const names = [series.title, ...(series.alt_titles || []), ...(series.alternative_titles || [])];
  if (!names.some((n) => matches(n))) return null;
  const path = String(series.public_url).replace(/^\/+/, '');
  return `https://asurascans.com/${path}`;
}

// All scanlation aggregators, so all English-only in practice.
const COMMUNITY_PROBES = [
  { name: 'Weeb Central', host: 'weebcentral.com',  langs: ['en'], run: probeWeebCentral },
  { name: 'MangaPill',    host: 'mangapill.com',    langs: ['en'], run: probeMangaPill },
  { name: 'MangaKatana',  host: 'mangakatana.com',  langs: ['en'], run: probeMangaKatana },
  { name: 'Fanfox',       host: 'fanfox.net',       langs: ['en'], run: probeFanfox },
  { name: 'Asura Scans',  host: 'asurascans.com',   langs: ['en'], run: probeAsura },
];

// ── WebView probe targets ──────────────────────────────────────────────────
//
// The sites above answer a plain fetch. These don't — they're either a shell
// that renders results in JS, or behind a challenge that requires running it.
// A WebView solves both: it executes the page and clears the challenge the
// same way the reader already does when it opens these sites.
//
// `pathRe` is what makes a link a series link on that site; the extractor
// itself is generic (every anchor plus its text), so a template change costs
// us a match rather than a wrong one.
export const WEBVIEW_PROBES = [
  {
    name: 'MangaFire', host: 'mangafire.to', langs: ['en'],
    search: (q) => `https://mangafire.to/filter?keyword=${encodeURIComponent(q)}`,
    pathRe: /^(https:\/\/mangafire\.to)?\/manga\/[^/]+$/,
  },
  // Asura moved to COMMUNITY_PROBES (probeAsura): its JSON API answers in one
  // fetch, where the WebView probe spent a full lane on a search page that
  // returns the whole catalogue and can therefore never confirm anything.
  {
    // comick.io now 301s to comick.dev — probing the old host spent a whole
    // lane following the redirect before it could even meet the challenge.
    name: 'Comick', host: 'comick.dev', langs: ['en'],
    search: (q) => `https://comick.dev/search?q=${encodeURIComponent(q)}`,
    pathRe: /^(https:\/\/comick\.dev)?\/comic\/[^/]+$/,
  },
  {
    name: 'MangaKakalot', host: 'natomanga.com', langs: ['en'],
    search: (q) => `https://www.natomanga.com/search/story/${encodeURIComponent(q).replace(/%20/g, '_')}`,
    pathRe: /natomanga\.com\/manga\/[^/]+$/,
  },
  {
    name: 'MangaHub', host: 'mangahub.io', langs: ['en'],
    search: (q) => `https://mangahub.io/search?q=${encodeURIComponent(q)}`,
    pathRe: /^(https:\/\/mangahub\.io)?\/manga\/[^/]+$/,
  },
  // Bato.to removed 2026-08-10: the domain does not resolve. It was costing a
  // full 9.5s lane timeout on every series to confirm that, which is a tenth
  // of the whole probing budget spent on a site that no longer exists.
];

// Which WebView probes are worth running for a given reader + result set.
export function pendingWebviewProbes(found, language = DEFAULT_APP_LANG) {
  const have = new Set((found || []).map((s) => s.host));
  return WEBVIEW_PROBES.filter(
    (p) => !have.has(p.host) && (p.langs.includes('any') || p.langs.includes(language))
  );
}

// Runs inside the WebView. Collects every anchor with its text and reports
// back, retrying while the page fills in — these are exactly the sites whose
// results don't exist at load time. Gives up after ~9s rather than sitting on
// a challenge page forever.
export const SOURCE_PROBE_JS = `
(function() {
  if (window.__inkloreProbe) return true;
  window.__inkloreProbe = true;
  var sent = false;
  function harvest() {
    var out = [];
    var seen = {};
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length && out.length < 400; i++) {
      var a = as[i];
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || seen[h]) continue;
      var t = (a.innerText || a.textContent || '').trim();
      if (!t) {
        var img = a.querySelector('img');
        if (img) t = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
      }
      if (!t || t.length > 140) continue;
      seen[h] = 1;
      out.push([h, t]);
    }
    return out;
  }
  function report(done) {
    if (sent) return;
    var links = harvest();
    // Anything under ~8 links is still the page shell; keep waiting unless
    // this is the final attempt.
    if (!done && links.length < 8) return;
    sent = true;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'sourceProbe', url: location.href, links: links,
      }));
    }
  }
  setTimeout(function(){ report(false); }, 1200);
  setTimeout(function(){ report(false); }, 3000);
  setTimeout(function(){ report(false); }, 5500);
  setTimeout(function(){ report(true);  }, 9000);
  true;
})();
`;

// Picks the series link out of what the WebView harvested. Same exact-title
// bar as everywhere else — an unmatched first result is the wrong series.
export function pickProbeLink(links, target, matches) {
  for (const pair of links || []) {
    const href = pair?.[0];
    const label = pair?.[1];
    if (!href || !label) continue;
    const abs = href.startsWith('http') ? href : `https://${target.host}${href.startsWith('/') ? '' : '/'}${href}`;
    let pathOnly;
    try { pathOnly = new URL(abs).pathname; } catch (_) { continue; }
    if (!target.pathRe.test(abs) && !target.pathRe.test(pathOnly)) continue;
    if (!matches(label)) continue;
    return abs;
  }
  return null;
}

// ── Assembly ───────────────────────────────────────────────────────────────

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function officialEntry(host) {
  if (!host) return null;
  return OFFICIAL_HOSTS[host] || OFFICIAL_HOSTS[host.replace(/^[^.]+\./, '')] || null;
}

function nameFromHost(host) {
  const base = (host || '').replace(/^www\./, '').split('.')[0];
  if (!base) return 'Official';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}  [opts.searchKey]
 * @param {string[]}[opts.altTitles]   alternate titles, used for matching only
 * @param {string}  [opts.mangaId]     MangaDex UUID, if resolved
 * @param {object}  [opts.mdLinks]     MangaDex attributes.links
 * @param {Array}   [opts.anilistLinks]
 * @param {string}  [opts.originalLang] the series' own language, for `raw`
 * @param {string}  [opts.language]  the reader's chosen language
 * @returns {Promise<Array<{ name, url, host, official, langs }>>} — may be empty
 */
export async function resolveReadSources({
  title, searchKey, altTitles, mangaId, mdLinks, anilistLinks,
  originalLang, language = DEFAULT_APP_LANG,
} = {}) {
  const query = searchKey || title || '';
  if (!query) return [];

  const matches = makeMatcher([title, searchKey, ...(altTitles || [])]);

  const out = [];
  const seen = new Set();

  // The language gate. A source is kept when it publishes in the reader's
  // language, or when it's genuinely multilingual ('any' — MangaDex). This is
  // what stops the English and Japanese editions of the same platform both
  // showing up regardless of who's looking.
  function speaksLanguage(langs) {
    if (!langs || langs.includes('any')) return true;
    return langs.includes(language);
  }

  function push(src) {
    if (!src?.url || !src.host) return;
    if (isStore(src.host)) return;
    if (!speaksLanguage(src.langs)) return;
    const key = src.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(src);
  }

  // Official releases, straight from MangaDex's per-title map. `engtl` is the
  // publisher's own page for this series in English, so it's English by
  // definition; `raw` is the official original-language edition, so its
  // language is the series' own.
  const MD_LINK_LANGS = { engtl: ['en'], raw: [originalLang || 'ja'] };
  for (const key of ['engtl', 'raw']) {
    const raw = mdLinks?.[key];
    if (!raw || !/^https?:\/\//.test(String(raw))) continue;
    const host = hostOf(String(raw));
    if (!host) continue;
    const entry = officialEntry(host);
    push({
      name: entry?.name || nameFromHost(host),
      url: String(raw),
      host,
      official: true,
      // The link's own meaning wins over the host's general profile: a `raw`
      // link is the Japanese edition even on a host that also publishes
      // English elsewhere.
      langs: MD_LINK_LANGS[key],
    });
  }

  // AniList's curated links, allowlisted. AniList tags most links with their
  // language, which is more precise than the host table — a `/ja/` path on a
  // multilingual platform is exactly the case the host table can't see.
  for (const link of anilistLinks || []) {
    const host = hostOf(link?.url);
    const entry = officialEntry(host);
    if (!entry) continue;
    const tagged = normalizeLangName(link.language);
    push({ name: entry.name, url: link.url, host, official: true, langs: tagged ? [tagged] : entry.langs });
  }

  // MangaDex, when the UUID resolved — the id came from matching this title,
  // so the URL is the series page. Multilingual by design, so no gate.
  if (mangaId) {
    push({
      name: 'MangaDex',
      url: `https://mangadex.org/title/${mangaId}`,
      host: 'mangadex.org',
      official: false,
      langs: ['any'],
    });
  }

  // Community sources, in parallel — one slow site shouldn't hold up the row.
  // Skipped entirely when they can't serve this language, so a Japanese reader
  // doesn't wait on two English-only probes.
  const eligible = COMMUNITY_PROBES.filter((p) => speaksLanguage(p.langs));
  const probed = await Promise.all(
    eligible.map((p) => p.run(query, matches).catch(() => null))
  );
  probed.forEach((url, i) => {
    if (!url) return;
    const p = eligible[i];
    push({ name: p.name, url, host: p.host, official: false, langs: p.langs });
  });

  // Legal sources lead; order within each band is the order established above.
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.official === b.s.official ? a.i - b.i : (a.s.official ? -1 : 1)))
    .map((x) => x.s)
    .slice(0, MAX_SOURCES);
}

// Cached wrapper — the probes are five network round-trips, and re-running
// them every time someone backs out of a detail screen and returns would be
// both slow and rude to the sites involved.
function cacheKeyFor(query, language) {
  // Language is part of the key, not just the query: the answer for a Japanese
  // reader is a different list, and a shared key would serve one to the other
  // for twelve hours after they switched.
  return `${CACHE_PFX}${language}/${norm(query)}`;
}

/**
 * @returns {Promise<{ sources: Array, probed: boolean }>} `probed` is true when
 *   a previous run already completed the WebView pass, so the caller can skip
 *   re-checking sites that were checked and legitimately didn't have it.
 */
export async function getReadSources(opts) {
  const query = opts?.searchKey || opts?.title || '';
  if (!query) return { sources: [], probed: true };
  const language = opts?.language || currentLanguage();
  const key = cacheKeyFor(query, language);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const { ts, data, probed } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data)) {
        return { sources: data, probed: !!probed };
      }
    }
  } catch (_) {}

  const fresh = await resolveReadSources({ ...opts, language });
  // Only cache a non-empty answer. An empty result is usually a transient
  // network failure, and caching it would hide every source for 12 hours.
  // Never marked probed here — the WebView pass hasn't run yet.
  if (fresh.length) {
    AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: fresh, probed: false })).catch(() => {});
  }
  return { sources: fresh, probed: false };
}

// Called once the WebView probes finish, to fold their hits into the cached
// list. Separate from getReadSources because those results arrive seconds
// later and out of order; writing them back — with `probed` set — means the
// next visit is instant and complete instead of re-running six WebView loads
// to rediscover the same misses.
export async function cacheReadSources(opts, sources) {
  const query = opts?.searchKey || opts?.title || '';
  if (!query) return;
  const language = opts?.language || currentLanguage();
  AsyncStorage
    .setItem(cacheKeyFor(query, language), JSON.stringify({ ts: Date.now(), data: sources || [], probed: true }))
    .catch(() => {});
}

// Same ordering rule the resolver applies, exported so late-arriving probe
// results land in the right place instead of just being appended.
export function sortSources(list) {
  return (list || [])
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.official === b.s.official ? a.i - b.i : (a.s.official ? -1 : 1)))
    .map((x) => x.s)
    .slice(0, MAX_SOURCES);
}
