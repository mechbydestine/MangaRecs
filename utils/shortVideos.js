// Short-form video for the feed.
//
// MangaRecs hosts no video. Rows in `feed_videos` name a third-party video by
// id, and the card embeds it through that platform's own player — so this
// module deals only in ids and metadata, never in media.
//
// The pool is fetched once per session and cached to AsyncStorage, matching
// how the manga feed already behaves: the feed has to build offline, and a
// video card that renders as a dead tile because the network was slow is worse
// than no video card at all.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const CACHE_KEY = '@mangarecs/feed_videos_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — the table changes on a human's schedule
const FETCH_LIMIT = 60;

// One video every VIDEO_EVERY cards. Five keeps it a change of pace rather
// than a second feed competing with the one people came for — at three it
// reads as a video app with manga in it, and past about eight most sessions
// never reach the second one.
export const VIDEO_EVERY = 5;

let _pool = [];
let _loaded = false;
let _inflight = null;
// Rotation cursor, so a session that scrolls a long way keeps dealing new
// videos instead of cycling the same handful every five cards.
let _cursor = 0;
// feedKey has to be unique for the FlatList's whole lifetime. The cursor wraps
// modulo the pool, so keying off it hands out the SAME key again as soon as
// the pool is exhausted — a duplicate React key, not just a cosmetic repeat.
// This never resets while the module is loaded.
let _keyCounter = 0;

function normalize(row) {
  return {
    id: `video_${row.provider}_${row.video_id}`,
    kind: 'video',
    provider: row.provider,
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || null,
    topic: row.topic || 'anime',
    durationSecs: row.duration_secs || null,
    thumbnailUrl: row.thumbnail_url || defaultThumbnail(row),
  };
}

// YouTube serves a predictable thumbnail for any video id, so a row with no
// stored thumbnail still renders art rather than a grey box.
function defaultThumbnail(row) {
  if (row.provider === 'youtube' && row.video_id) {
    return `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`;
  }
  return null;
}

async function readCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, rows } = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length) return null;
    return { fresh: Date.now() - at < CACHE_TTL, rows };
  } catch (_) {
    return null;
  }
}

async function writeCache(rows) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows }));
  } catch (_) {}
}

// Loads the pool. Safe to call repeatedly and concurrently — the first call
// owns the request and the rest await it.
export async function loadVideoPool() {
  if (_loaded) return _pool;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const cached = await readCache();
    // A stale cache is still shown; it just doesn't stop the refetch below.
    if (cached) _pool = cached.rows.map(normalize);

    let ok = true;
    if (!cached?.fresh) {
      const { data, error } = await supabase
        .from('feed_videos')
        .select('provider, video_id, title, channel, thumbnail_url, topic, duration_secs')
        .eq('active', true)
        .order('weight', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) {
        // Most likely cause is the §64 migration not having been run yet, which
        // returns PGRST205 ("table not found"). Anything here is non-fatal —
        // the feed just has no video in it.
        ok = false;
        if (__DEV__) console.warn('[feed_videos]', error.message || error);
      } else if (data?.length) {
        _pool = data.map(normalize);
        writeCache(data);
      }
    }

    // Only latch on success. Latching after a failure would mean a session that
    // started before the table existed (or during a network blip) never shows
    // video again until the app is killed — a pull-to-refresh should be able to
    // pick it up.
    _loaded = ok;
    _inflight = null;
    return _pool;
  })();

  return _inflight;
}

export function hasVideos() {
  return _pool.length > 0;
}

// Deals `count` videos off the rotation. Returns fewer (or none) rather than
// repeating within a single batch.
export function takeVideos(count) {
  if (_pool.length === 0 || count <= 0) return [];
  const out = [];
  const take = Math.min(count, _pool.length);
  for (let i = 0; i < take; i++) {
    const item = _pool[(_cursor + i) % _pool.length];
    out.push({ ...item, feedKey: `${item.id}_${++_keyCounter}` });
  }
  _cursor = (_cursor + take) % _pool.length;
  return out;
}

// Slots videos into a batch of manga cards, one every VIDEO_EVERY positions.
//
// `startOffset` is how many cards already sit above this batch in the feed, so
// the cadence stays even across appended pages instead of restarting — without
// it, every loadMore would put a video at the same position relative to the
// batch and they'd bunch up at the seams.
export function interleaveVideos(items, startOffset = 0) {
  if (!items?.length || _pool.length === 0) return items;

  // How many videos this batch needs, and where each one goes.
  const slots = [];
  for (let i = 0; i < items.length; i++) {
    const absolute = startOffset + i;
    // Never at absolute position 0 — the first thing in the feed should be
    // what the app is for.
    if (absolute > 0 && absolute % VIDEO_EVERY === 0) slots.push(i);
  }
  if (slots.length === 0) return items;

  const videos = takeVideos(slots.length);
  if (videos.length === 0) return items;

  const out = [];
  let v = 0;
  for (let i = 0; i < items.length; i++) {
    if (v < videos.length && slots[v] === i) {
      out.push(videos[v]);
      v++;
    }
    out.push(items[i]);
  }
  return out;
}

// Test/refresh hook — drops the in-memory pool so the next load refetches.
// _keyCounter is deliberately NOT reset: cards from before the reset can still
// be mounted, and restarting the counter would hand their keys out twice.
export function resetVideoPool() {
  _pool = [];
  _loaded = false;
  _inflight = null;
  _cursor = 0;
}
