import { useState, useEffect } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchMangaDex } from './mangaDexApi';

export const NSFW_KEY   = '@panelr/allowNsfw';
export const AI_REC_KEY = '@panelr/aiRecommendations';

// In-memory cache: key → result object, null (known failure), or undefined (never fetched)
const _cache = {};

// NSFW preference cached in memory so we never hit AsyncStorage per cover fetch
let _nsfwCache = null;
async function getAllowNsfw() {
  if (_nsfwCache !== null) return _nsfwCache;
  try { _nsfwCache = (await AsyncStorage.getItem(NSFW_KEY)) === 'true'; }
  catch (_) { _nsfwCache = false; }
  return _nsfwCache;
}
export function invalidateNsfwCache() { _nsfwCache = null; }

// Concurrency limiter: at most 20 cover fetches in flight simultaneously
let _active = 0;
const _waiting = [];
const MAX_CONCURRENT = 20;

function acquireSlot() {
  if (_active < MAX_CONCURRENT) { _active++; return Promise.resolve(); }
  return new Promise((res) => _waiting.push(res));
}

function releaseSlot() {
  if (_waiting.length > 0) {
    _waiting.shift()();
  } else {
    _active--;
  }
}

export function clearCoverCache(title, lang) {
  const base = (title || '').toLowerCase().trim();
  delete _cache[`${base}:false:${lang || ''}`];
  delete _cache[`${base}:true:${lang || ''}`];
  delete _cache[`${base}:false:`];
  delete _cache[`${base}:true:`];
}

export function clearAllCoversCache() {
  Object.keys(_cache).forEach((k) => delete _cache[k]);
}

// ── Persistent cover URL store ─────────────────────────────────────────────
// Survives app restarts so covers never need re-fetching after the first session.

const COVER_URL_STORE_KEY = '@panelr/cover_urls_v3';

export async function hydrateCoverCache() {
  try {
    const raw = await AsyncStorage.getItem(COVER_URL_STORE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw); // { "base:lang": coverUrl }
    Object.entries(stored).forEach(([k, coverUrl]) => {
      if (!coverUrl) return;
      const sepIdx = k.lastIndexOf(':');
      const base   = k.slice(0, sepIdx);
      const lang   = k.slice(sepIdx + 1);
      const entry  = { coverUrl };
      // Populate all four lookup slots so any code path finds the URL
      if (_cache[`${base}:false:${lang}`] === undefined) _cache[`${base}:false:${lang}`] = entry;
      if (_cache[`${base}:true:${lang}`]  === undefined) _cache[`${base}:true:${lang}`]  = entry;
      if (lang) {
        if (_cache[`${base}:false:`] === undefined) _cache[`${base}:false:`] = entry;
        if (_cache[`${base}:true:`]  === undefined) _cache[`${base}:true:`]  = entry;
      }
    });
  } catch (_) {}
}

function persistCoverUrl(base, lang, coverUrl) {
  // Fire-and-forget — never blocks the cover display path
  AsyncStorage.getItem(COVER_URL_STORE_KEY).then((raw) => {
    try {
      const stored = raw ? JSON.parse(raw) : {};
      stored[`${base}:${lang || ''}`] = coverUrl;
      AsyncStorage.setItem(COVER_URL_STORE_KEY, JSON.stringify(stored)).catch(() => {});
    } catch (_) {}
  }).catch(() => {});
}

export function prewarmCoverCache(title, lang, coverUrl) {
  if (!coverUrl) return;
  const base = (title || '').toLowerCase().trim();
  if (!base) return;
  const entry = { coverUrl };
  // Fill all four lookup slots (nsfw true/false × with/without lang)
  if (_cache[`${base}:false:${lang || ''}`] === undefined) _cache[`${base}:false:${lang || ''}`] = entry;
  if (_cache[`${base}:true:${lang || ''}`]  === undefined) _cache[`${base}:true:${lang || ''}`]  = entry;
  if (_cache[`${base}:false:`] === undefined) _cache[`${base}:false:`] = entry;
  if (_cache[`${base}:true:`]  === undefined) _cache[`${base}:true:`]  = entry;
  // Persist so the URL survives app restarts
  persistCoverUrl(base, lang, coverUrl);
}

const LANG_TO_COUNTRY = { ja: 'JP', ko: 'KR', zh: 'CN' };

// ── Per-source timeout ────────────────────────────────────────────────────────

const COVER_FETCH_TIMEOUT = 5000;

function withFetchTimeout(p, ms = COVER_FETCH_TIMEOUT) {
  return Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
}

// ── Source 1: MangaDex ────────────────────────────────────────────────────────

async function fetchFromMangaDex(title, lang, allowNsfw) {
  const result = await searchMangaDex(title, { lang, allowNsfw });
  if (result?.coverUrl) return { coverUrl: result.coverUrl, mangaPageUrl: `https://mangadex.org/title/${result.id}` };
  if (lang) {
    const retry = await searchMangaDex(title, { allowNsfw });
    if (retry?.coverUrl) return { coverUrl: retry.coverUrl, mangaPageUrl: `https://mangadex.org/title/${retry.id}` };
  }
  return null;
}

// ── Source 2: AniList ─────────────────────────────────────────────────────────

const ANILIST_QUERY = `
  query ($search: String, $country: CountryCode, $isAdult: Boolean) {
    Media(search: $search, type: MANGA, countryOfOrigin: $country, isAdult: $isAdult) {
      id
      coverImage { extraLarge large }
      siteUrl
    }
  }
`;

async function fetchFromAniList(title, lang, allowNsfw) {
  const variables = { search: title };
  const country = LANG_TO_COUNTRY[lang];
  if (country) variables.country = country;
  if (!allowNsfw) variables.isAdult = false;

  const resp = await withFetchTimeout(fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY, variables }),
  }));
  if (!resp?.ok) return null;
  const json = await resp.json();
  const media = json?.data?.Media;
  if (!media) return null;
  const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large || null;
  return coverUrl ? { coverUrl } : null;
}

// ── Source 3: Jikan (MyAnimeList) ─────────────────────────────────────────────

async function fetchFromJikan(title) {
  const resp = await withFetchTimeout(fetch(
    `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=5`,
    { headers: { Accept: 'application/json' } }
  ));
  if (!resp?.ok) return null;
  const json = await resp.json();
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(title);
  const manga = (json?.data || []).find((m) =>
    [norm(m.title), norm(m.title_english)].some((c) => {
      if (!c) return false;
      if (c === q) return true;
      const ratio = (c.length - q.length) / q.length;
      if (Math.abs(ratio) > 0.4) return false;
      return c.startsWith(q) || q.startsWith(c);
    })
  );
  if (!manga) return null;
  const coverUrl = manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url || null;
  return coverUrl ? { coverUrl } : null;
}

// ── Source 4: Comick ──────────────────────────────────────────────────────────

async function fetchFromComick(title) {
  const resp = await withFetchTimeout(fetch(
    `https://api.comick.fun/v1.0/search?q=${encodeURIComponent(title)}&limit=5&type=comic`,
    { headers: { Accept: 'application/json' } }
  ));
  if (!resp?.ok) return null;
  const json = await resp.json();
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(title);
  const hit = (Array.isArray(json) ? json : []).find((m) => {
    const t = norm(m.title || m.slug);
    if (!t) return false;
    if (t === q) return true;
    const ratio = (t.length - q.length) / q.length;
    if (Math.abs(ratio) > 0.4) return false;
    return t.startsWith(q) || q.startsWith(t);
  });
  if (!hit) return null;
  const cover = hit.cover_url || (hit.md_covers?.[0]?.gpurl) || null;
  return cover ? { coverUrl: cover } : null;
}

// ── Source 5: Kitsu ───────────────────────────────────────────────────────────

async function fetchFromKitsu(title) {
  const resp = await withFetchTimeout(fetch(
    `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(title)}&page[limit]=5`,
    { headers: { Accept: 'application/vnd.api+json' } }
  ));
  if (!resp?.ok) return null;
  const json = await resp.json();
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(title);
  const hit = (json?.data || []).find((m) => {
    const attrs = m.attributes || {};
    const candidates = [attrs.canonicalTitle, ...(Object.values(attrs.titles || {}))];
    return candidates.some((c) => {
      const cn = norm(c);
      if (!cn) return false;
      if (cn === q) return true;
      const ratio = (cn.length - q.length) / q.length;
      if (Math.abs(ratio) > 0.45) return false;
      return cn.startsWith(q) || q.startsWith(cn);
    });
  });
  if (!hit) return null;
  const img = hit.attributes?.posterImage;
  const coverUrl = img?.original || img?.large || img?.medium || null;
  return coverUrl ? { coverUrl } : null;
}

// ── Parallel cover race ────────────────────────────────────────────────────────
// All 5 sources fire simultaneously. Resolves as soon as any source returns a
// valid cover; falls back to null only when all five fail.

function raceSources(title, lang, allowNsfw) {
  return new Promise((resolve) => {
    let pending = 5;
    let resolved = false;

    function onResult(result) {
      if (resolved) return;
      if (result?.coverUrl) {
        resolved = true;
        resolve(result);
        return;
      }
      if (--pending === 0) resolve(null);
    }

    fetchFromMangaDex(title, lang, allowNsfw).then(onResult).catch(() => onResult(null));
    fetchFromAniList(title, lang, allowNsfw).then(onResult).catch(() => onResult(null));
    fetchFromJikan(title).then(onResult).catch(() => onResult(null));
    fetchFromComick(title).then(onResult).catch(() => onResult(null));
    fetchFromKitsu(title).then(onResult).catch(() => onResult(null));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchMangaInfo(title, lang) {
  const base = title.toLowerCase().trim();
  const allowNsfw = await getAllowNsfw();
  const key    = `${base}:${allowNsfw}:${lang || ''}`;
  const altKey = `${base}:${!allowNsfw}:${lang || ''}`;

  if (_cache[key] !== undefined) return _cache[key];

  // Cross-check the opposite nsfw slot to avoid a redundant network round-trip.
  // Prewarmed covers and covers already fetched in the other slot are reused here.
  if (_cache[altKey] !== undefined) {
    _cache[key] = _cache[altKey];
    return _cache[key];
  }

  await acquireSlot();

  // Re-check after acquiring slot (another request may have resolved it while we waited)
  if (_cache[key] !== undefined) { releaseSlot(); return _cache[key]; }
  if (_cache[altKey] !== undefined) {
    _cache[key] = _cache[altKey];
    releaseSlot();
    return _cache[key];
  }

  try {
    const result = await raceSources(title, lang, allowNsfw);
    if (result?.coverUrl) {
      _cache[key]    = result;
      _cache[altKey] = result; // fill both slots to prevent duplicate fetches
      persistCoverUrl(base, lang, result.coverUrl);
      return result;
    }
    // No cover found — do NOT negatively cache so the next mount can retry.
    return null;
  } catch (_) {
    return null;
  } finally {
    releaseSlot();
  }
}

export function getCachedCoverUrl(title, lang) {
  const base = (title || '').toLowerCase().trim();
  return (
    _cache[`${base}:false:${lang || ''}`]?.coverUrl ||
    _cache[`${base}:true:${lang || ''}`]?.coverUrl ||
    null
  );
}

export function MangaCover({ title, searchKey, lang, color = '#1A1A1F', style, children }) {
  const lookupTitle = searchKey || title;
  const [coverUrl, setCoverUrl] = useState(() => getCachedCoverUrl(lookupTitle, lang));

  useEffect(() => {
    let cancelled = false;
    fetchMangaInfo(lookupTitle, lang).then((info) => {
      if (!cancelled && info?.coverUrl) setCoverUrl(info.coverUrl);
    });
    return () => { cancelled = true; };
  }, [title, searchKey, lang]);

  function onError() {
    clearCoverCache(lookupTitle, lang);
    setCoverUrl(null);
  }

  return (
    <View style={[coverStyles.wrap, { backgroundColor: color }, style]}>
      {coverUrl && (
        <Image
          source={{ uri: coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          transition={140}
          onError={onError}
        />
      )}
      {children}
    </View>
  );
}

export async function openMangaOnBestSite(title, { searchKey, lang } = {}) {
  const lookupTitle = searchKey || title;
  const q = encodeURIComponent(lookupTitle);
  try {
    const info = await fetchMangaInfo(lookupTitle, lang);
    if (info?.mangaPageUrl) {
      await Linking.openURL(info.mangaPageUrl);
      return;
    }
  } catch (_) {}
  await Linking.openURL(`https://mangadex.org/search?q=${q}`);
}

export function getFaviconUrl(siteUrl) {
  const domain = (siteUrl || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

const coverStyles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
