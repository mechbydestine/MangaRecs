import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentLanguage, mangadexLangFor } from './language';
import { reportError } from './crashReporting';

const BASE = 'https://api.mangadex.org';
const TIMEOUT = 5000;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
}

function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Returns all title strings for a manga: primary + all altTitles variants
function getAllTitles(manga) {
  const primary = Object.values(manga.attributes?.title || {});
  const alts = (manga.attributes?.altTitles || []).flatMap((obj) => Object.values(obj));
  return [...primary, ...alts];
}

function findBestMatch(data, query) {
  const q = normTitle(query);
  if (!q || !data?.length) return null;

  // 1. Exact match (primary title or any altTitle variant)
  const exact = data.find((m) => getAllTitles(m).some((t) => normTitle(t) === q));
  if (exact) return exact;

  // 2. Partial match — candidate title must be within 40% of query length
  //    Prevents "Berserk" matching "Berserk of Gluttony", "Monster" → "Monster Farm", etc.
  const partial = data.find((m) =>
    getAllTitles(m).some((t) => {
      const tl = normTitle(t);
      if (!tl) return false;
      const lengthRatio = (tl.length - q.length) / q.length;
      if (Math.abs(lengthRatio) > 0.4) return false;
      return tl.startsWith(q) || q.startsWith(tl);
    })
  );

  return partial || null;
}

// Returns an ARRAY of matches for search-as-you-type UIs:
// [{ id, title, coverUrl, lang, chapters }]
export async function searchMangaDexList(query, { limit = 8, allowNsfw = false } = {}) {
  try {
    const ratings = allowNsfw
      ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
      : 'contentRating[]=safe&contentRating[]=suggestive';
    const resp = await withTimeout(
      fetch(
        `${BASE}/manga?title=${encodeURIComponent(query)}&limit=${limit}&includes[]=cover_art&order[relevance]=desc&${ratings}`,
        { headers: { Accept: 'application/json' } }
      ),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const { data } = await resp.json();
    if (!data?.length) return [];
    return data.map((manga) => {
      const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
      const coverUrl = coverRel?.attributes?.fileName
        ? `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`
        : null;
      const titleObj = manga.attributes?.title || {};
      const title = titleObj.en || Object.values(titleObj)[0] || query;
      const lastCh = parseFloat(manga.attributes?.lastChapter);
      return {
        id: manga.id,
        title,
        coverUrl,
        lang: manga.attributes?.originalLanguage || 'ja',
        chapters: Number.isFinite(lastCh) && lastCh > 0 ? Math.round(lastCh) : 0,
        contentRating: manga.attributes?.contentRating || 'safe',
      };
    });
  } catch (e) {
    reportError(e, 'mangadex.searchList', { query });
    return [];
  }
}

// Returns { id, title, coverUrl } or null
export async function searchMangaDex(query, { lang, allowNsfw = false } = {}) {
  try {
    // Always include suggestive — most mainstream manga (Berserk, Tokyo Ghoul, etc.)
    // are rated suggestive on MangaDex, not safe. Only explicit content is NSFW-gated.
    const ratings = allowNsfw
      ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
      : 'contentRating[]=safe&contentRating[]=suggestive';
    const langFilter = lang ? `&originalLanguage[]=${lang}` : '';

    const resp = await withTimeout(
      fetch(
        `${BASE}/manga?title=${encodeURIComponent(query)}&limit=10&includes[]=cover_art&order[relevance]=desc&${ratings}${langFilter}`,
        { headers: { Accept: 'application/json' } }
      ),
      TIMEOUT
    );
    if (!resp?.ok) return null;
    const json = await resp.json();
    const data = json?.data;
    if (!data?.length) return null;

    const manga = findBestMatch(data, query);
    if (!manga) return null;

    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    const coverUrl = coverRel?.attributes?.fileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`
      : null;

    const titleObj = manga.attributes?.title || {};
    const title = titleObj.en || Object.values(titleObj)[0] || query;

    return { id: manga.id, title, coverUrl, contentRating: manga.attributes?.contentRating || 'safe' };
  } catch (e) {
    reportError(e, 'mangadex.search');
    return null;
  }
}

// Returns array of { id, chapter, title, volume, pages }
// Sorted ascending by chapter number, deduped, full pagination.
//
// Translation language follows the app's language setting — that's most of
// what "the app knows I'm a Japanese reader" should mean in the reader itself.
// Falls back to English when a series has no chapters in that language, since
// an empty chapter list reads as a broken series rather than a missing
// translation.
export async function getMangaChapters(mangaId, lang) {
  const wanted = mangadexLangFor(lang || currentLanguage());
  const rows = await fetchChapterFeed(mangaId, wanted);
  if (rows.length || wanted === 'en') return rows;
  return fetchChapterFeed(mangaId, 'en');
}

async function fetchChapterFeed(mangaId, translatedLanguage) {
  try {
    const all = [];
    let offset = 0;
    const batchSize = 500;
    while (true) {
      const resp = await withTimeout(
        fetch(
          `${BASE}/manga/${mangaId}/feed?translatedLanguage[]=${encodeURIComponent(translatedLanguage)}&order[chapter]=asc&limit=${batchSize}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`,
          { headers: { Accept: 'application/json' } }
        ),
        TIMEOUT
      );
      if (!resp?.ok) break;
      const json = await resp.json();
      const batch = json?.data || [];
      all.push(...batch);
      // Stop if this was the last page or we hit the safety cap
      if (batch.length < batchSize || all.length >= 2000) break;
      offset += batchSize;
    }
    const seen = new Set();
    return all
      .filter((c) => (c.attributes?.pages || 0) > 0)
      .map((c) => ({
        id: c.id,
        chapter: parseFloat(c.attributes?.chapter) || 0,
        title: c.attributes?.title || '',
        volume: c.attributes?.volume || null,
        pages: c.attributes?.pages || 0,
      }))
      // Sort in JS to guarantee ascending order regardless of server-side quirks
      .sort((a, b) => a.chapter - b.chapter)
      .filter((c) => {
        const key = String(c.chapter);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch (_) {
    return [];
  }
}

// Batch community-rating + follower-count lookup via the MangaDex statistics
// endpoint. Returns { [mangaId]: { rating, readers } } — rating stays on
// MangaDex's native 0–10 scale (matches the curated pool, e.g. One Piece
// 9.1), readers is a formatted follower count (e.g. "812K"). Ids with no
// rating/follows yet (brand-new series) omit that key rather than faking one.
export async function getMangaStatistics(ids) {
  const out = {};
  if (!ids?.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const qs = ids.slice(i, i + 100).map((id) => `manga[]=${encodeURIComponent(id)}`).join('&');
      const resp = await withTimeout(
        fetch(`${BASE}/statistics/manga?${qs}`, { headers: { Accept: 'application/json' } }),
        TIMEOUT
      );
      if (!resp?.ok) continue;
      const json = await resp.json();
      Object.entries(json?.statistics || {}).forEach(([id, s]) => {
        const entry = {};
        const ten = s?.rating?.bayesian || s?.rating?.average; // native 0–10 scale
        if (ten) entry.rating = Math.round(ten * 10) / 10;
        const readers = formatReaderCount(s?.follows);
        if (readers) entry.readers = readers;
        if (Object.keys(entry).length) out[id] = entry;
      });
    }
  } catch (_) {}
  return out;
}

// Chapter-list cache: repeat opens of the same series skip the paginated
// MangaDex fetch entirely for 6 hours.
const CHAPTER_LIST_CACHE_PFX = '@mangarecs/chlist/';
const CHAPTER_LIST_TTL = 6 * 60 * 60 * 1000;

export async function getMangaChaptersCached(mangaId, lang) {
  // Language belongs in the key: the same series has a different chapter list
  // per translation, and a shared key would serve the previous language's list
  // for six hours after the setting changed.
  const wanted = mangadexLangFor(lang || currentLanguage());
  const key = `${CHAPTER_LIST_CACHE_PFX}${wanted}/${mangaId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CHAPTER_LIST_TTL && Array.isArray(data)) return data;
    }
  } catch (_) {}
  const fresh = await getMangaChapters(mangaId, wanted);
  if (fresh.length > 0) {
    AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: fresh })).catch(() => {});
  }
  return fresh;
}

// ── Bulk manga fetching (Popular / Recently Updated) ────────────────────────

const TAG_NAMES = {
  'Action': 'Action', 'Adventure': 'Adventure', 'Comedy': 'Comedy',
  'Drama': 'Drama', 'Fantasy': 'Fantasy', 'Horror': 'Horror',
  'Mystery': 'Mystery', 'Romance': 'Romance', 'Science Fiction': 'Sci-Fi',
  'Slice of Life': 'Slice of Life', 'Sports': 'Sports',
  'Supernatural': 'Supernatural', 'Martial Arts': 'Martial Arts',
  'Psychological': 'Psychological', 'Historical': 'Historical',
  'Thriller': 'Thriller', 'Isekai': 'Isekai', 'Wuxia': 'Martial Arts',
  'Xianxia': 'Fantasy', 'Mecha': 'Sci-Fi', 'Magic': 'Fantasy',
  'School Life': 'Slice of Life', 'Harem': 'Romance',
};

const DARK_COLORS = [
  '#1A0A0A','#0A0A1A','#0A1A0A','#1A1A0A','#0A1A1A','#1A0A1A',
  '#0D0A1A','#0A0D1A','#1A0D0A','#0D1A0A','#2D0A0A','#0A0A2D',
  '#0A2D0A','#2D2D0A','#0A2D2D','#2D0A2D','#1A0A2D','#2D0A1A',
  '#0A2D1A','#1A2D0A','#2D1A0A','#0D1A2D','#1A0D2D','#2D1A1A',
];

function stableColorForId(id) {
  if (!id) return '#1A0A0A';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return DARK_COLORS[Math.abs(h) % DARK_COLORS.length];
}

// Formats a raw follower count the same way the curated pool's "readers"
// strings are written (e.g. "24.7M", "812K") so live entries match on sight.
function formatReaderCount(n) {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Formats an ISO timestamp into the same relative-time shorthand the curated
// pool uses ("2d ago", "3w ago", "1y ago") instead of the static "recently".
function formatUpdatedAgo(isoDate) {
  if (!isoDate) return 'recently';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'recently';
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return min <= 1 ? 'just now' : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function normalizeManga(manga) {
  const attrs = manga.attributes || {};
  const titleObj = attrs.title || {};
  const altTitles = attrs.altTitles || [];
  const enAlt   = altTitles.find((obj) => obj.en)?.['en']         || null;
  const jaRoAlt = altTitles.find((obj) => obj['ja-ro'])?.['ja-ro'] || null;
  const koRoAlt = altTitles.find((obj) => obj['ko-ro'])?.['ko-ro'] || null;
  const rawFallback = Object.values(titleObj)[0] || 'Unknown';
  // For CJK-primary titles (no English in titleObj), prefer the romanized form (ja-ro / ko-ro)
  // over a potentially incorrect literal English alt translation (e.g. "Revolving Battle of Curses")
  const isCjkPrimary = !titleObj.en && /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(rawFallback);
  const title = titleObj.en
    || (isCjkPrimary ? (jaRoAlt || koRoAlt || enAlt) : enAlt)
    || jaRoAlt || koRoAlt || rawFallback;
  const descObj = attrs.description || {};
  const rawDesc = descObj.en || Object.values(descObj)[0] || '';
  const desc = rawDesc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n+/g, ' ').trim();
  const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
  const coverUrl = coverRel?.attributes?.fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`
    : null;
  const authorRel = manga.relationships?.find((r) => r.type === 'author');
  const author = authorRel?.attributes?.name || '';
  const genreList = (attrs.tags || [])
    .filter((t) => t.attributes?.group === 'genre')
    .map((t) => TAG_NAMES[t.attributes?.name?.en])
    .filter(Boolean)
    .slice(0, 3);
  const genres = genreList.length ? genreList : ['Action'];
  const lang = attrs.originalLanguage || 'ja';
  const chapters = parseInt(attrs.lastChapter) || 0;
  return {
    id: manga.id,
    title,
    searchKey: title,
    lang,
    description: desc.slice(0, 220),
    genre: genres,
    genres,
    // null (not a fake placeholder) until getMangaStatistics fills in a real
    // 0–10 score — MangaDetailScreen/FeedScreen already hide the rating pill
    // when it's falsy, which is more honest than showing a made-up number.
    rating: null,
    chapters,
    readers: '',
    color: stableColorForId(manga.id),
    author,
    updated: formatUpdatedAgo(attrs.updatedAt),
    likeCount: 0,
    commentCount: 0,
    discussing: 0,
    latestChapter: chapters,
    coverUrl,
    contentRating: attrs.contentRating || 'safe',
    fromApi: true,
  };
}

// v4: rating now matches the curated pool's 0–10 scale (was halved to a
// 0–5 scale before) and readers is backfilled from MangaDex follow counts.
const POPULAR_CACHE_KEY = '@mangarecs/mdex_popular_v4';
const RECENT_CACHE_KEY  = '@mangarecs/mdex_recent_v4';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch (_) { return null; }
}

async function writeCache(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {}
}

// ── Trending, per original language ────────────────────────────────────────
//
// fetchPopularManga below asks for the most-followed manga overall, which is a
// ranking of all-time fame: it returns the same handful of Japanese classics
// every time, in every language, forever. That is why the feed read as
// nothing but shonen no matter how often it was refreshed.
//
// This asks a different question — "what is being followed AND actively
// updating, within one original language" — so manhwa and manhua get their own
// ranked lists instead of competing against One Piece for a slot. The activity
// window is what makes it current rather than historical: on `ko` it narrows
// 7,458 all-time titles down to ~450 that have shipped a chapter recently.
const TRENDING_WINDOW_DAYS = 90;
// Deliberately far more than any one build shows. The caller samples from this
// head at random, so a wide window is what stops two builds ever matching —
// with a limit of 6 there would be nothing to sample and every refresh would
// return the identical six titles.
const TRENDING_POOL = 100;

function trendingCacheKey(lang, offset) {
  return `@mangarecs/mdex_trending_v1_${lang}_${offset}`;
}

// `offset` pages deeper into the ranking. Callers rotate it so a returning
// user is sampling from a different slice of the list than last session,
// rather than re-shuffling the same 100 rows.
export async function fetchTrendingByLanguage(lang, { offset = 0, allowNsfw = false } = {}) {
  const cached = await readCache(trendingCacheKey(lang, offset));
  if (cached) return cached;
  try {
    const ratings = allowNsfw
      ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica'
      : 'contentRating[]=safe&contentRating[]=suggestive';
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86400000)
      .toISOString().slice(0, 19);
    const resp = await withTimeout(
      fetch(
        `${BASE}/manga?originalLanguage[]=${encodeURIComponent(lang)}`
        + `&order[followedCount]=desc&updatedAtSince=${since}`
        + `&limit=${TRENDING_POOL}&offset=${offset}`
        + `&includes[]=cover_art&includes[]=author&${ratings}`,
        { headers: { Accept: 'application/json' } }
      ),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const json = await resp.json();
    const data = (json?.data || []).map(normalizeManga);
    // Without a cover the card falls back to a letter in a box, which is the
    // exact "missing identity" this whole pass exists to remove.
    const usable = data.filter((d) => d.coverUrl);
    if (usable.length) {
      const stats = await getMangaStatistics(usable.map((d) => d.id));
      usable.forEach((d) => {
        const s = stats[d.id];
        if (s?.rating) d.rating = s.rating;
        if (s?.readers) d.readers = s.readers;
      });
      await writeCache(trendingCacheKey(lang, offset), usable);
    }
    return usable;
  } catch (_) { return []; }
}

// Returns up to `limit` most-followed manga from MangaDex, normalized to app shape.
// Results are cached for 6 hours in AsyncStorage.
export async function fetchPopularManga({ limit = 30, allowNsfw = false } = {}) {
  const cached = await readCache(POPULAR_CACHE_KEY);
  if (cached) return cached;
  try {
    const ratings = allowNsfw
      ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica'
      : 'contentRating[]=safe&contentRating[]=suggestive';
    const resp = await withTimeout(
      fetch(
        `${BASE}/manga?order[followedCount]=desc&limit=${limit}&includes[]=cover_art&includes[]=author&${ratings}`,
        { headers: { Accept: 'application/json' } }
      ),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const json = await resp.json();
    const data = (json?.data || []).map(normalizeManga);
    if (data.length) {
      const stats = await getMangaStatistics(data.map((d) => d.id));
      data.forEach((d) => {
        const s = stats[d.id];
        if (s?.rating) d.rating = s.rating;
        if (s?.readers) d.readers = s.readers;
      });
      await writeCache(POPULAR_CACHE_KEY, data);
    }
    return data;
  } catch (_) { return []; }
}

// Returns up to `limit` most recently updated manga from MangaDex, normalized.
export async function fetchRecentlyUpdated({ limit = 20, allowNsfw = false } = {}) {
  const cached = await readCache(RECENT_CACHE_KEY);
  if (cached) return cached;
  try {
    const ratings = allowNsfw
      ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica'
      : 'contentRating[]=safe&contentRating[]=suggestive';
    const resp = await withTimeout(
      fetch(
        `${BASE}/manga?order[latestUploadedChapter]=desc&limit=${limit}&includes[]=cover_art&includes[]=author&${ratings}`,
        { headers: { Accept: 'application/json' } }
      ),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const json = await resp.json();
    const data = (json?.data || []).map(normalizeManga);
    if (data.length) {
      const stats = await getMangaStatistics(data.map((d) => d.id));
      data.forEach((d) => {
        const s = stats[d.id];
        if (s?.rating) d.rating = s.rating;
        if (s?.readers) d.readers = s.readers;
      });
      await writeCache(RECENT_CACHE_KEY, data);
    }
    return data;
  } catch (_) { return []; }
}

// Lightweight update check: returns the latest chapter number for a manga, or null.
// Uses the manga metadata endpoint instead of fetching all 500 chapters.
export async function getLatestChapter(mangaId) {
  try {
    const resp = await withTimeout(
      fetch(`${BASE}/manga/${mangaId}`, { headers: { Accept: 'application/json' } }),
      TIMEOUT
    );
    if (!resp?.ok) return null;
    const json = await resp.json();
    const lastCh = json?.data?.attributes?.lastChapter;
    return lastCh ? parseFloat(lastCh) : null;
  } catch (_) {
    return null;
  }
}

const CONTENT_TAG_NAMES = {
  'Gore': 'Graphic Violence', 'Sexual Violence': 'Sexual Violence',
  'Psychological': 'Psychological Trauma', 'Violence': 'Violence',
};
const STATUS_LABELS = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus', cancelled: 'Cancelled' };
const DEMOGRAPHIC_LABELS = { shounen: 'Shōnen', shoujo: 'Shōjo', seinen: 'Seinen', josei: 'Josei' };

// Full detail fetch for the Manga Detail screen — everything normalizeManga
// truncates or skips: untruncated synopsis, author vs artist (MangaDex keeps
// these as separate relationship types), all genre tags (not just 3),
// content-warning tags, status, demographic, alt titles, publication year.
// Detail-cache is separate from the card-list cache (different shape, longer TTL —
// this data changes rarely once a series exists).
// v2: adds `links` (MangaDex's per-title official-source map) — cached v1
// entries don't carry it, and a stale hit would render an empty source row.
const DETAIL_CACHE_PFX = '@mangarecs/mdex_detail_v2/';
const DETAIL_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getMangaFullDetails(mangaId) {
  if (!mangaId) return null;
  const cacheKey = DETAIL_CACHE_PFX + mangaId;
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < DETAIL_CACHE_TTL) return data;
    }
  } catch (_) {}

  try {
    const resp = await withTimeout(
      fetch(`${BASE}/manga/${mangaId}?includes[]=author&includes[]=artist&includes[]=cover_art`, {
        headers: { Accept: 'application/json' },
      }),
      TIMEOUT
    );
    if (!resp?.ok) return null;
    const json = await resp.json();
    const manga = json?.data;
    if (!manga) return null;
    const attrs = manga.attributes || {};

    const titleObj = attrs.title || {};
    const title = titleObj.en || Object.values(titleObj)[0] || '';
    const altTitles = (attrs.altTitles || []).flatMap((o) => Object.values(o)).filter((t) => t && t !== title);

    const descObj = attrs.description || {};
    const rawDesc = descObj.en || Object.values(descObj)[0] || '';
    const description = rawDesc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

    const authors = manga.relationships?.filter((r) => r.type === 'author').map((r) => r.attributes?.name).filter(Boolean) || [];
    const artists = manga.relationships?.filter((r) => r.type === 'artist').map((r) => r.attributes?.name).filter(Boolean) || [];

    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    const coverUrl = coverRel?.attributes?.fileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`
      : null;

    const genres = (attrs.tags || [])
      .filter((t) => t.attributes?.group === 'genre' || t.attributes?.group === 'theme')
      .map((t) => t.attributes?.name?.en)
      .filter(Boolean);

    const contentWarnings = (attrs.tags || [])
      .filter((t) => t.attributes?.group === 'content')
      .map((t) => CONTENT_TAG_NAMES[t.attributes?.name?.en] || t.attributes?.name?.en)
      .filter(Boolean);

    const result = {
      id: manga.id,
      title,
      altTitles: altTitles.slice(0, 4),
      description,
      coverUrl,
      authors,
      artists,
      genres,
      contentWarnings,
      status: STATUS_LABELS[attrs.status] || attrs.status || null,
      demographic: DEMOGRAPHIC_LABELS[attrs.publicationDemographic] || null,
      year: attrs.year || null,
      lang: attrs.originalLanguage || 'ja',
      contentRating: attrs.contentRating || 'safe',
      lastChapter: attrs.lastChapter ? parseFloat(attrs.lastChapter) : null,
      lastVolume: attrs.lastVolume || null,
      // Per-title official links, moderator-maintained: `engtl` (official
      // English release), `raw` (official Japanese), plus store keys
      // amz/ebj/cdj/bw. This is the only source-availability data we get that
      // is actually verified for THIS series rather than guessed from a search.
      links: attrs.links || null,
    };

    AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: result })).catch(() => {});
    return result;
  } catch (_) {
    return null;
  }
}

// Returns array of page image URLs for a chapter
export async function getChapterPages(chapterId) {
  try {
    const resp = await withTimeout(
      fetch(`${BASE}/at-home/server/${chapterId}`, {
        headers: { Accept: 'application/json' },
      }),
      TIMEOUT
    );
    if (!resp?.ok) return [];
    const json = await resp.json();
    const { baseUrl, chapter } = json || {};
    if (!baseUrl || !chapter?.hash || !chapter?.data?.length) return [];
    return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
  } catch (e) {
    // The reader turns an empty list into "Pages unavailable". Without this the
    // user sees that message and nothing anywhere says whether it was a
    // timeout, a 404, or MangaDex rate-limiting the whole user base.
    reportError(e, 'mangadex.chapterPages', { chapterId });
    return [];
  }
}
