// The rules that decide what is allowed to become a Library card. Worth
// pinning: the failure this prevents (a YouTube video sitting in Reading
// forever) is invisible at write time and only shows up later as "my library
// is a mess".
import {
  isReadingHost,
  isSeriesPage,
  libraryKey,
  dedupeEntries,
  hostOf,
} from '../utils/libraryEligibility';

describe('isReadingHost', () => {
  test.each([
    'https://mangafire.to/manga/solo-leveling.abc',
    'https://asurascans.com/comics/some-series',
    'https://www.webtoons.com/en/action/thing/list?title_no=123',
    'https://mangadex.org/title/abc-def',
    'https://m.mangafire.to/manga/x',          // subdomain
    'https://chapmanganato.to/manga-xy123',
  ])('accepts reading site %s', (url) => {
    expect(isReadingHost(url)).toBe(true);
  });

  test.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://en.wikipedia.org/wiki/Manga',
    'https://discord.gg/abcdef',
    'https://www.google.com/search?q=solo+leveling',
    'https://twitter.com/someone/status/1',
    'https://reddit.com/r/manga',
  ])('rejects non-reading site %s', (url) => {
    expect(isReadingHost(url)).toBe(false);
  });

  test('a lookalike domain is not accepted on substring alone', () => {
    // The check is suffix-anchored, so this must not pass just because it
    // contains "mangadex.org".
    expect(isReadingHost('https://mangadex.org.evil.com/title/x')).toBe(false);
  });

  test('malformed input never throws', () => {
    expect(isReadingHost('')).toBe(false);
    expect(isReadingHost(null)).toBe(false);
    expect(isReadingHost('not a url')).toBe(false);
  });
});

describe('hostOf', () => {
  test('strips www', () => {
    expect(hostOf('https://www.mangadex.org/x')).toBe('mangadex.org');
  });
});

describe('isSeriesPage', () => {
  test('a series page on a reading host qualifies', () => {
    expect(isSeriesPage('https://mangafire.to/manga/solo-leveling.abc')).toBe(true);
  });

  test.each([
    'https://mangafire.to/',
    'https://mangafire.to/search?keyword=solo',
    'https://mangafire.to/browse',
    'https://asurascans.com/login',
    'https://mangadex.org/titles/latest',
  ])('a non-series page does not qualify: %s', (url) => {
    expect(isSeriesPage(url)).toBe(false);
  });

  test('a series page on a non-reading host never qualifies', () => {
    expect(isSeriesPage('https://youtube.com/manga/whatever')).toBe(false);
  });
});

describe('libraryKey', () => {
  test('collapses subtitle variants of the same series', () => {
    expect(libraryKey('Demon Slayer')).toBe(libraryKey('Demon Slayer: Kimetsu no Yaiba'));
    expect(libraryKey('Solo Leveling')).toBe(libraryKey('Solo Leveling (Official)'));
  });

  test('ignores punctuation and case', () => {
    expect(libraryKey('ONE PIECE')).toBe(libraryKey('One Piece'));
    expect(libraryKey("Kaguya-sama")).toBe(libraryKey('Kaguya sama'));
  });

  test('strips volume and season suffixes', () => {
    expect(libraryKey('Berserk Vol. 3')).toBe(libraryKey('Berserk'));
    expect(libraryKey('Vinland Saga Season 2')).toBe(libraryKey('Vinland Saga'));
  });

  test('does NOT merge genuinely different series', () => {
    // The exact trap readSources.js documents: three extra characters sit
    // inside any sane similarity ratio, but it is a different manga.
    expect(libraryKey('Dragon Ball')).not.toBe(libraryKey('Dragon Ball SD'));
    expect(libraryKey('Naruto')).not.toBe(libraryKey('Boruto'));
  });
});

describe('dedupeEntries', () => {
  test('keeps one entry per series, newest wins', () => {
    const out = dedupeEntries([
      { title: 'Demon Slayer', chapter: 3, updatedAt: 100 },
      { title: 'Demon Slayer: Kimetsu no Yaiba', chapter: 9, updatedAt: 200 },
      { title: 'One Piece', chapter: 1, updatedAt: 50 },
    ]);
    expect(out).toHaveLength(2);
    const ds = out.find((e) => libraryKey(e.title) === libraryKey('Demon Slayer'));
    expect(ds.chapter).toBe(9);
  });

  test('prefers the longer title so the card keeps its subtitle', () => {
    const out = dedupeEntries([
      { title: 'Demon Slayer: Kimetsu no Yaiba', updatedAt: 100 },
      { title: 'Demon Slayer', updatedAt: 200 },
    ]);
    expect(out[0].title).toBe('Demon Slayer: Kimetsu no Yaiba');
  });

  test('drops entries with no usable title', () => {
    expect(dedupeEntries([{ title: '' }, { title: null }, {}])).toHaveLength(0);
  });
});
