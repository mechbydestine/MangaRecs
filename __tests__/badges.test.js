// The badge engine decides what 201 badges a user has earned. It's pure, it's
// invisible when wrong, and "wrong" means either handing out a Mythic badge to
// someone who didn't earn it or silently withholding one they did — neither of
// which produces an error anyone sees.
import {
  ALL_BADGES,
  GRADE_ORDER,
  PROGRESS_GRADES,
  computeEarnedBadgeIds,
  badgeProgress,
  seasonActive,
  highestGradeEarned,
  gradeAtLeast,
  nextUpBadges,
} from '../utils/badges';

describe('badge catalogue integrity', () => {
  it('has unique ids', () => {
    const ids = ALL_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses grades from GRADE_ORDER', () => {
    const bad = ALL_BADGES.filter((b) => !GRADE_ORDER.includes(b.grade));
    expect(bad.map((b) => `${b.id}:${b.grade}`)).toEqual([]);
  });

  it('gives every badge a requirement', () => {
    const bad = ALL_BADGES.filter((b) => !b.requirement || !b.requirement.type);
    expect(bad.map((b) => b.id)).toEqual([]);
  });

  it('keeps PROGRESS_GRADES a subset of GRADE_ORDER', () => {
    for (const g of PROGRESS_GRADES) expect(GRADE_ORDER).toContain(g);
  });
});

describe('computeEarnedBadgeIds', () => {
  it('awards nothing to a brand-new account', () => {
    expect(computeEarnedBadgeIds({}).size).toBe(0);
  });

  it('awards the first-chapter badge at exactly 1', () => {
    expect(computeEarnedBadgeIds({ chapters_read: 0 }).has('first_page')).toBe(false);
    expect(computeEarnedBadgeIds({ chapters_read: 1 }).has('first_page')).toBe(true);
  });

  it('honours the boolean flags as well as the counters', () => {
    // has_comment exists because the counter can lag behind the action.
    expect(computeEarnedBadgeIds({ has_comment: true }).has('speak_up')).toBe(true);
    expect(computeEarnedBadgeIds({ comments_count: 1 }).has('speak_up')).toBe(true);
    expect(computeEarnedBadgeIds({ has_like: true }).has('first_heart')).toBe(true);
    expect(computeEarnedBadgeIds({ has_friend: true }).has('not_alone')).toBe(true);
  });

  it('is monotonic — more reading never removes a badge', () => {
    const low = computeEarnedBadgeIds({ chapters_read: 50, hours_read: 5, streak_count: 3 });
    const high = computeEarnedBadgeIds({ chapters_read: 5000, hours_read: 500, streak_count: 300 });
    for (const id of low) expect(high.has(id)).toBe(true);
    expect(high.size).toBeGreaterThan(low.size);
  });

  it('respects each threshold exactly', () => {
    // Off-by-one at a tier boundary is the classic silent badge bug.
    const chapterBadges = ALL_BADGES.filter((b) => b.requirement.type === 'chapters' && !b.season);
    for (const b of chapterBadges) {
      const v = b.requirement.value;
      expect(computeEarnedBadgeIds({ chapters_read: v - 1 }).has(b.id)).toBe(false);
      expect(computeEarnedBadgeIds({ chapters_read: v }).has(b.id)).toBe(true);
    }
  });

  it('never awards special or binge badges from plain stats', () => {
    const huge = computeEarnedBadgeIds({
      chapters_read: 1e6, hours_read: 1e6, streak_count: 1e6, series_count: 1e6,
      friends_count: 1e6, comments_count: 1e6, likes_given: 1e6, completed_count: 1e6,
      night_reads: 1e6, genres_count: 1e6, shares_count: 1e6, manga_count: 1e6,
      ratings_count: 1e6, account_days: 1e6, has_avatar: true,
    });
    const wrongly = ALL_BADGES.filter(
      (b) => (b.requirement.type === 'special' || b.requirement.type === 'binge') && huge.has(b.id)
    );
    expect(wrongly.map((b) => b.id)).toEqual([]);
  });
});

describe('badgeProgress', () => {
  it('returns null for requirement types with no stat behind them', () => {
    expect(badgeProgress({ requirement: { type: 'special' } }, {})).toBeNull();
    expect(badgeProgress({ requirement: {} }, {})).toBeNull();
  });

  it('clamps to the target and never exceeds 100%', () => {
    const b = { requirement: { type: 'chapters', value: 100 } };
    expect(badgeProgress(b, { chapters_read: 250 })).toEqual({ current: 100, target: 100, pct: 1 });
  });

  it('clamps negative or missing stats to zero', () => {
    const b = { requirement: { type: 'chapters', value: 100 } };
    expect(badgeProgress(b, { chapters_read: -5 }).current).toBe(0);
    expect(badgeProgress(b, {}).pct).toBe(0);
  });

  it('reports a partial fraction', () => {
    const b = { requirement: { type: 'hours', value: 40 } };
    expect(badgeProgress(b, { hours_read: 10 }).pct).toBeCloseTo(0.25);
  });
});

describe('seasonActive', () => {
  const seasonal = { season: { start: '2026-07-01', end: '2026-08-01' } };

  it('treats non-seasonal badges as always active', () => {
    expect(seasonActive({}, new Date('2020-01-01'))).toBe(true);
  });

  it('is inclusive of the start and exclusive of the end', () => {
    expect(seasonActive(seasonal, new Date('2026-07-01T00:00:00Z'))).toBe(true);
    expect(seasonActive(seasonal, new Date('2026-07-31T23:59:59Z'))).toBe(true);
    expect(seasonActive(seasonal, new Date('2026-08-01T00:00:00Z'))).toBe(false);
    expect(seasonActive(seasonal, new Date('2026-06-30T23:59:59Z'))).toBe(false);
  });
});

describe('grade helpers', () => {
  it('returns null when nothing is earned', () => {
    expect(highestGradeEarned(new Set())).toBeNull();
  });

  it('picks the highest grade, not the most recent', () => {
    const gold = ALL_BADGES.find((b) => b.grade === 'gold');
    const grey = ALL_BADGES.find((b) => b.grade === 'grey');
    expect(highestGradeEarned(new Set([grey.id, gold.id]))).toBe('gold');
  });

  it('orders grades correctly', () => {
    expect(gradeAtLeast('gold', 'blue')).toBe(true);
    expect(gradeAtLeast('blue', 'gold')).toBe(false);
    expect(gradeAtLeast('mythic', 'mythic')).toBe(true);
  });
});

describe('nextUpBadges', () => {
  it('never suggests something already earned', () => {
    const stats = { chapters_read: 60 };
    const earned = computeEarnedBadgeIds(stats);
    for (const n of nextUpBadges(stats, earned, 5)) {
      expect(earned.has(n.badge.id)).toBe(false);
    }
  });

  it('returns at most the requested count, closest first', () => {
    const out = nextUpBadges({ chapters_read: 60 }, new Set(), 3);
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].pct).toBeGreaterThanOrEqual(out[i].pct);
  });

  it('never suggests a hidden badge', () => {
    for (const n of nextUpBadges({ chapters_read: 60 }, new Set(), 20)) {
      expect(n.badge.hidden).toBeFalsy();
    }
  });
});
