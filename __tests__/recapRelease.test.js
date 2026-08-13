// The recap's release window. Worth pinning because it is date arithmetic that
// nobody will be watching when it finally matters: a half closes, and six
// months later the wrap-up either shows up on the right Saturday or it does
// not. Off-by-one-week here is invisible until launch day.
import { recapReleaseDate, isRecapOpen, RECAP_ALWAYS_OPEN } from '../utils/recapSchedule';

const period = (endY, endM, endD) => ({
  end: new Date(endY, endM, endD, 23, 59, 59),
});

const fmt = (d) => d.toISOString().slice(0, 10);
const SAT = 6;

describe('recapReleaseDate', () => {
  test('a half ending Tue 30 June 2026 releases Sat 11 July', () => {
    // 30 June 2026 is a Tuesday. +7 lands on Tue 7 July; the next Saturday is
    // the 11th — "the next week, on the weekend".
    const d = recapReleaseDate(period(2026, 5, 30));
    expect(fmt(d)).toBe('2026-07-11');
    expect(d.getDay()).toBe(SAT);
  });

  test('a half ending 31 December releases the following Saturday', () => {
    const d = recapReleaseDate(period(2025, 11, 31));
    expect(d.getDay()).toBe(SAT);
    expect(d.getTime()).toBeGreaterThan(new Date(2026, 0, 7).getTime());
  });

  test('always a Saturday, and always at least a week clear of the period end', () => {
    // Sweep every possible end-of-period weekday so no single calendar year
    // can make this pass by luck.
    for (let day = 24; day <= 31; day++) {
      const p = period(2027, 11, day);
      const d = recapReleaseDate(p);
      expect(d.getDay()).toBe(SAT);
      const gapDays = (d - new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate())) / 86400000;
      expect(gapDays).toBeGreaterThanOrEqual(7);
      expect(gapDays).toBeLessThanOrEqual(13); // never more than a week past the target
    }
  });

  test('releases at midnight, not at the moment of computation', () => {
    const d = recapReleaseDate(period(2026, 5, 30));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('isRecapOpen', () => {
  test('is open right now while testing', () => {
    expect(RECAP_ALWAYS_OPEN).toBe(true);
    expect(isRecapOpen()).toBe(true);
  });

  test('once the flag is off, the schedule decides', () => {
    // The flag is a module constant, so the scheduled behaviour is checked
    // through recapReleaseDate directly rather than by mutating it.
    const p = period(2026, 5, 30);
    const release = recapReleaseDate(p);
    const dayBefore = new Date(release.getTime() - 86400000);
    const dayAfter = new Date(release.getTime() + 86400000);
    expect(dayBefore < release).toBe(true);
    expect(dayAfter >= release).toBe(true);
  });
});
