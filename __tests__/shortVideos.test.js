// The interleave cadence is the one bit of this feature with real arithmetic
// in it: it has to hold across appended pages, which is where an off-by-one
// shows up as videos bunching at every loadMore seam rather than as a crash.
import { interleaveVideos, takeVideos, resetVideoPool, VIDEO_EVERY } from '../utils/shortVideos';

// takeVideos/interleaveVideos read a module-level pool that loadVideoPool
// normally fills from Supabase. These tests drive it through the same public
// surface by seeding the cache the loader reads.
const shortVideos = require('../utils/shortVideos');

function seedPool(n) {
  // The pool is module-private; the loader is what fills it. Rather than
  // reach inside, mimic what a fetch produces by calling the normalizer path
  // through loadVideoPool with a stubbed AsyncStorage cache.
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const rows = Array.from({ length: n }, (_, i) => ({
    provider: 'youtube',
    video_id: `vid${i}`,
    title: `Video ${i}`,
    channel: 'Chan',
    thumbnail_url: null,
    topic: 'anime',
    duration_secs: 45,
  }));
  AsyncStorage.getItem.mockResolvedValueOnce(
    JSON.stringify({ at: Date.now(), rows })
  );
  return shortVideos.loadVideoPool();
}

const manga = (n, start = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${start + i}`, feedKey: `m${start + i}` }));

beforeEach(() => {
  resetVideoPool();
  jest.clearAllMocks();
});

describe('interleaveVideos', () => {
  test('is a no-op when the pool is empty', () => {
    const items = manga(12);
    expect(interleaveVideos(items, 0)).toBe(items);
  });

  test('never puts a video at absolute position 0', async () => {
    await seedPool(10);
    const out = interleaveVideos(manga(12), 0);
    expect(out[0].kind).toBeUndefined();
  });

  test('places one video every VIDEO_EVERY absolute positions', async () => {
    await seedPool(10);
    const out = interleaveVideos(manga(VIDEO_EVERY * 3), 0);
    const videoPositions = out
      .map((it, i) => (it.kind === 'video' ? i : -1))
      .filter((i) => i >= 0);
    // First video sits at the slot for absolute index VIDEO_EVERY; each
    // insertion shifts later ones by one, so gaps are VIDEO_EVERY + 1 apart.
    expect(videoPositions.length).toBe(2);
    expect(videoPositions[0]).toBe(VIDEO_EVERY);
    expect(videoPositions[1]).toBe(VIDEO_EVERY * 2 + 1);
  });

  test('cadence continues across pages instead of restarting', async () => {
    await seedPool(10);
    // A second page that starts at an absolute offset one short of a slot
    // should place its video at local index 1, not at VIDEO_EVERY.
    const out = interleaveVideos(manga(VIDEO_EVERY, 100), VIDEO_EVERY * 4 - 1);
    const firstVideo = out.findIndex((it) => it.kind === 'video');
    expect(firstVideo).toBe(1);
  });

  test('a page with no slot in range is returned untouched', async () => {
    await seedPool(10);
    const items = manga(2, 200);
    // Offsets 1 and 2 — neither is a multiple of VIDEO_EVERY.
    expect(interleaveVideos(items, 1)).toBe(items);
  });
});

describe('takeVideos', () => {
  test('does not repeat within one batch', async () => {
    await seedPool(6);
    const batch = takeVideos(6);
    expect(new Set(batch.map((v) => v.videoId)).size).toBe(6);
  });

  test('returns at most the pool size', async () => {
    await seedPool(3);
    expect(takeVideos(10)).toHaveLength(3);
  });

  test('advances the cursor so consecutive batches differ', async () => {
    await seedPool(6);
    const first = takeVideos(3).map((v) => v.videoId);
    const second = takeVideos(3).map((v) => v.videoId);
    expect(second).not.toEqual(first);
  });

  test('gives every card a unique feedKey', async () => {
    await seedPool(4);
    const keys = [...takeVideos(4), ...takeVideos(4)].map((v) => v.feedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
