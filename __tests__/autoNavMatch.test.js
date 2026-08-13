// The title guard inside AUTO_NAV_SEARCH_JS.
//
// The bug it fixes is silent and therefore nasty: on a site whose search does
// not filter server-side (Asura Scans returns its entire catalogue for every
// query, verified byte-for-byte against its homepage), auto-nav used to click
// whichever series was first in the DOM. Searching "Solo Leveling" opened
// "Solo Max Level Newbie" and nothing about the result looked like a failure.
//
// The script is a string injected into a WebView, so the matcher is extracted
// here and exercised directly against the real cases.
import { AUTO_NAV_SEARCH_JS } from '../utils/siteResolver';

// Pull the three functions out of the injected source and evaluate them in a
// tiny harness, so the test covers the code that actually ships rather than a
// copy that can drift.
function buildMatcher(query) {
  const src = AUTO_NAV_SEARCH_JS;
  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`${name} not found in AUTO_NAV_SEARCH_JS`);
    // Walk braces to the end of the function.
    let i = src.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
    throw new Error(`unterminated ${name}`);
  };

  const body = `
    var window = { __mangarecsQuery: ${JSON.stringify(query)} };
    ${grab('normTxt')}
    ${grab('hasQuery')}
    ${grab('titleMatches')}
    return titleMatches;
  `;
  // eslint-disable-next-line no-new-func
  return new Function(body)();
}

const link = (href, text, alt) => ({
  href,
  textContent: text || '',
  querySelector: () => (alt ? { getAttribute: (a) => (a === 'alt' ? alt : null) } : null),
});

describe('auto-nav title guard', () => {
  test('the live Asura failure: Solo Leveling must not match Solo Max Level Newbie', () => {
    const matches = buildMatcher('Solo Leveling');
    expect(matches(link('https://asurascans.com/comics/solo-max-level-newbie-7e1f454a', 'Solo Max Level Newbie'))).toBe(false);
  });

  test('matches the right series by href slug', () => {
    const matches = buildMatcher('Solo Leveling');
    expect(matches(link('https://asurascans.com/comics/solo-leveling-abc', ''))).toBe(true);
  });

  test('matches by link text', () => {
    const matches = buildMatcher('Solo Leveling');
    expect(matches(link('https://site.tld/manga/12345', 'Solo Leveling'))).toBe(true);
  });

  test('matches by image alt when the anchor has no text', () => {
    const matches = buildMatcher('Solo Leveling');
    expect(matches(link('https://site.tld/manga/12345', '', 'Solo Leveling'))).toBe(true);
  });

  test('subtitle variants still match', () => {
    const matches = buildMatcher('Demon Slayer');
    expect(matches(link('https://site.tld/manga/x', 'Demon Slayer: Kimetsu no Yaiba'))).toBe(true);
  });

  test('unrelated series are rejected', () => {
    const matches = buildMatcher('Demon Slayer');
    expect(matches(link('https://site.tld/manga/one-piece', 'One Piece'))).toBe(false);
    expect(matches(link('https://site.tld/manga/naruto', 'Naruto'))).toBe(false);
  });

  test('partial word overlap is not enough', () => {
    const matches = buildMatcher('Dragon Ball');
    // "Dragon" alone must not carry it — every query word has to appear.
    expect(matches(link('https://site.tld/manga/dragon-quest', 'Dragon Quest'))).toBe(false);
  });

  test('with no query at all, anything is allowed', () => {
    // Resume/direct opens carry no search term; the guard must not block them.
    const matches = buildMatcher('');
    expect(matches(link('https://site.tld/manga/whatever', 'Whatever'))).toBe(true);
  });

  test('punctuation and case differences do not break matching', () => {
    const matches = buildMatcher('kaguya-sama');
    expect(matches(link('https://site.tld/manga/x', 'Kaguya Sama'))).toBe(true);
  });
});
