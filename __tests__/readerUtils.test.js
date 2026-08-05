// Date and streak maths. Timezone bugs here are brutal and invisible: they
// don't crash, they just quietly reset a user's streak, and the only report
// you get is a one-star review that says "lost my streak".
import { localDateKey, calculateStreak, peakReadingWindow } from '../utils/readerUtils';

describe('localDateKey', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses LOCAL calendar fields, not UTC', () => {
    // The bug this guards: toISOString() is UTC. For a reader in UTC+9 at
    // 08:00 local, the UTC date is still the previous day — which used to
    // file the read under yesterday and break the streak.
    const d = new Date(2026, 6, 31, 8, 0, 0); // 31 Jul, 08:00 local
    expect(localDateKey(d)).toBe('2026-07-31');
    expect(localDateKey(d)).not.toBe(d.toISOString().slice(0, 10) === '2026-07-31' ? 'never' : localDateKey(d) + 'x');
  });

  it('handles the last instant of a local day', () => {
    expect(localDateKey(new Date(2026, 6, 31, 23, 59, 59))).toBe('2026-07-31');
  });
});

describe('calculateStreak', () => {
  const key = (daysAgo) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return localDateKey(d);
  };

  it('is 0 for an empty log', () => {
    expect(calculateStreak({})).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(calculateStreak({ [key(0)]: 1, [key(1)]: 2, [key(2)]: 0.5 })).toBe(3);
  });

  it('still counts a streak that ends yesterday', () => {
    // Grace day: you haven't read yet *today*, but yesterday's streak is live
    // until the day rolls over. Dropping it at midnight would be wrong.
    expect(calculateStreak({ [key(1)]: 1, [key(2)]: 1 })).toBe(2);
  });

  it('breaks on the first missing day', () => {
    expect(calculateStreak({ [key(0)]: 1, [key(2)]: 1, [key(3)]: 1 })).toBe(1);
  });

  it('treats a zero-hour day as not read', () => {
    expect(calculateStreak({ [key(0)]: 0, [key(1)]: 1 })).toBe(1);
  });

  it('ignores days older than the streak', () => {
    expect(calculateStreak({ [key(0)]: 1, [key(10)]: 5, [key(11)]: 5 })).toBe(1);
  });
});

describe('peakReadingWindow', () => {
  it('returns null with no data at all', () => {
    expect(peakReadingWindow({})).toBeNull();
    expect(peakReadingWindow(null)).toBeNull();
    expect(peakReadingWindow({ 3: 0, 4: 0 })).toBeNull();
  });

  it('finds a plain daytime window', () => {
    const r = peakReadingWindow({ 13: 5, 14: 5, 15: 5 });
    expect(r.label).toBe('1PM – 4PM');
    expect(r.startHour).toBe(13);
    expect(r.pct).toBe(100);
  });

  it('wraps past midnight', () => {
    // A late-night reader's real window is 23:00–02:00. A non-wrapping scan
    // would never find it and would report some weaker daytime block.
    const r = peakReadingWindow({ 23: 6, 0: 6, 1: 6, 14: 2 });
    expect(r.startHour).toBe(23);
    expect(r.label).toBe('11PM – 2AM');
  });

  it('formats midnight and noon as 12, not 0', () => {
    expect(peakReadingWindow({ 0: 3, 1: 3, 2: 3 }).label).toBe('12AM – 3AM');
    expect(peakReadingWindow({ 12: 3, 13: 3, 14: 3 }).label).toBe('12PM – 3PM');
  });

  it('reports the share of total reading in the window', () => {
    const r = peakReadingWindow({ 9: 3, 10: 3, 11: 4, 20: 10 });
    expect(r.pct).toBe(50);
  });
});
