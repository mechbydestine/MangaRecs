// The recap's per-reader identity: colour maths plus the classifier that
// turns someone's library into a design language. When this is wrong nobody
// gets an error — they get a recap slide with unreadable text on it, which is
// the most-shared screen in the app.
import {
  parseHex, rgba, rgbToHsl, hslToHex, adjust, mix,
  luminance, contrast, legible, MODES, buildIdentity, surfaceFor,
} from '../utils/recapIdentity';

describe('parseHex', () => {
  it('parses 6-digit hex with and without the hash', () => {
    expect(parseHex('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHex('00FF00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('returns null for junk rather than throwing', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(parseHex('not a colour')).toBeNull();
  });
});

describe('rgba', () => {
  it('builds a css rgba string', () => {
    expect(rgba('#7B5CFF', 0.5)).toBe('rgba(123,92,255,0.5)');
  });
});

describe('hsl round-trip', () => {
  it('survives a round trip within rounding error', () => {
    for (const hex of ['#7B5CFF', '#1D9E75', '#FF0000', '#123456', '#FFFFFF', '#000000']) {
      const back = hslToHex(rgbToHsl(parseHex(hex)));
      const a = parseHex(hex);
      const b = parseHex(back);
      expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(2);
    }
  });

  it('keeps greys grey', () => {
    const back = hslToHex(rgbToHsl(parseHex('#808080')));
    const { r, g, b } = parseHex(back);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(2);
  });
});

describe('luminance and contrast', () => {
  it('puts black at 0 and white at 1', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 3);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 3);
  });

  it('gives black-on-white the WCAG 21:1 maximum', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is symmetric', () => {
    expect(contrast('#7B5CFF', '#0D0D0F')).toBeCloseTo(contrast('#0D0D0F', '#7B5CFF'), 6);
  });

  it('gives a colour against itself a ratio of 1', () => {
    expect(contrast('#7B5CFF', '#7B5CFF')).toBeCloseTo(1, 6);
  });
});

describe('legible', () => {
  it('lifts a dark accent off a dark surface until it clears the threshold', () => {
    const out = legible('#1A1030', '#0D0D0F', 4.2);
    expect(contrast(out, '#0D0D0F')).toBeGreaterThanOrEqual(4.2);
  });

  it('darkens a pale accent on a light surface', () => {
    const out = legible('#FFF8E0', '#FFFFFF', 4.2);
    expect(contrast(out, '#FFFFFF')).toBeGreaterThanOrEqual(4.2);
  });

  it('leaves an already-legible colour alone', () => {
    expect(legible('#FFFFFF', '#000000', 4.2)).toBe('#FFFFFF');
  });

  it('preserves hue while fixing lightness', () => {
    const before = rgbToHsl(parseHex('#3B2F8F'));
    const after = rgbToHsl(parseHex(legible('#3B2F8F', '#0D0D0F')));
    // Hue is on 0..1; allow a small drift from the rounding trip.
    expect(Math.abs(after.h - before.h)).toBeLessThan(0.02);
  });
});

describe('mix and adjust', () => {
  it('mixes endpoints exactly', () => {
    expect(parseHex(mix('#000000', '#FFFFFF', 0))).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex(mix('#000000', '#FFFFFF', 1))).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('mixes to mid-grey at t=0.5', () => {
    const { r } = parseHex(mix('#000000', '#FFFFFF', 0.5));
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
  });

  it('clamps lightness at the ends instead of wrapping', () => {
    // Wrapping here would turn "slightly darker than black" into white.
    expect(luminance(adjust('#000000', { dl: -0.5 }))).toBeCloseTo(0, 3);
    expect(luminance(adjust('#FFFFFF', { dl: 0.5 }))).toBeCloseTo(1, 3);
  });
});

describe('buildIdentity', () => {
  it('produces a usable identity from no data at all', () => {
    const id = buildIdentity([], {});
    expect(id).toBeTruthy();
    expect(id.mode).toBeTruthy();
    expect(Object.values(MODES)).toContain(id.mode);
  });

  it('ignores seeds with an unparseable colour', () => {
    const withJunk = buildIdentity([{ color: 'nope', country: 'JP' }], {});
    expect(withJunk.mode).toBe(MODES.neo);
  });

  it('falls back to the mixed-reader mode when no origin dominates', () => {
    const id = buildIdentity([
      { color: '#FF0000', country: 'JP', weight: 1 },
      { color: '#00FF00', country: 'KR', weight: 1 },
      { color: '#0000FF', country: 'CN', weight: 1 },
    ], {});
    expect(id.mode).toBe(MODES.neo);
  });

  it('is deterministic for the same input', () => {
    const seeds = [
      { color: '#7B5CFF', country: 'KR', weight: 4 },
      { color: '#1D9E75', country: 'KR', weight: 3 },
    ];
    expect(JSON.stringify(buildIdentity(seeds, {}))).toBe(JSON.stringify(buildIdentity(seeds, {})));
  });

  it('always yields an accent legible on its own surface', () => {
    // This is the whole point of the identity system: the accent is pulled
    // from the reader's real cover art, so it must be checked against the
    // surface it lands on rather than assumed readable.
    const cases = [
      [{ color: '#0A0A0A', country: 'JP', weight: 5 }],
      [{ color: '#FFFFFF', country: 'KR', weight: 5 }],
      [{ color: '#7B5CFF', country: 'CN', weight: 5 }],
      [{ color: '#1D9E75', country: 'JP', weight: 2 }, { color: '#EF9F27', country: 'JP', weight: 2 }],
    ];
    for (const seeds of cases) {
      const id = buildIdentity(seeds, {});
      const s = surfaceFor(id, 0);
      expect(contrast(s.ink, s.bg)).toBeGreaterThan(3);
    }
  });
});
