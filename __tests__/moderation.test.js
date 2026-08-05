// The two gatekeepers that decide what reaches the database. Both are pure
// string logic, both fail silently when wrong — a junk title becomes a fake
// "currently reading" entry on a public profile, and a filter miss is an App
// Store 1.2 problem.
import { isJunkTitle } from '../utils/titleValidation';
import { containsBlockedLanguage } from '../utils/contentFilter';

describe('isJunkTitle', () => {
  it('rejects empty and whitespace', () => {
    expect(isJunkTitle('')).toBe(true);
    expect(isJunkTitle('   ')).toBe(true);
    expect(isJunkTitle(null)).toBe(true);
    expect(isJunkTitle(undefined)).toBe(true);
  });

  it('rejects raw URLs', () => {
    expect(isJunkTitle('https://mangadex.org/title/abc')).toBe(true);
    expect(isJunkTitle('http://example.com')).toBe(true);
  });

  it('rejects site names scraped from a tab title', () => {
    expect(isJunkTitle('MangaDex')).toBe(true);
    expect(isJunkTitle('mangafire')).toBe(true);
    expect(isJunkTitle('Asura Scans')).toBe(true);
  });

  it('rejects generic page chrome', () => {
    for (const junk of ['Home', 'Homepage', 'Search Results', 'Recent Searches', 'Sign in', 'Settings', 'Trending', 'Not Found']) {
      expect(isJunkTitle(junk)).toBe(true);
    }
  });

  it('rejects chrome even with a site suffix tacked on', () => {
    // The case the two old duplicated lists both missed.
    expect(isJunkTitle('Homepage - SomeSite')).toBe(true);
    expect(isJunkTitle('Search results for one piece')).toBe(true);
    expect(isJunkTitle('404 Page Not Found')).toBe(true);
  });

  it('accepts real titles', () => {
    for (const real of [
      'One Piece',
      'Solo Leveling',
      'Frieren: Beyond Journey\'s End',
      'Kimetsu no Yaiba',
      'The Legend of the Northern Blade',
      '나 혼자만 레벨업',
    ]) {
      expect(isJunkTitle(real)).toBe(false);
    }
  });

  it('does not reject a title that merely contains a chrome word', () => {
    // "Home" as a prefix is chrome; "Welcome Home" is a plausible title.
    expect(isJunkTitle('Welcome Home')).toBe(false);
    expect(isJunkTitle('The Search for the Sacred Beast')).toBe(false);
  });
});

describe('containsBlockedLanguage', () => {
  it('passes ordinary text', () => {
    expect(containsBlockedLanguage('Great chapter, loved the fight scene')).toBe(false);
    expect(containsBlockedLanguage('')).toBe(false);
    expect(containsBlockedLanguage(null)).toBe(false);
  });

  it('catches blocked terms regardless of case', () => {
    expect(containsBlockedLanguage('what the FUCK')).toBe(true);
    expect(containsBlockedLanguage('Shit')).toBe(true);
  });

  it('catches suffixed forms', () => {
    expect(containsBlockedLanguage('that was shitty')).toBe(true);
    expect(containsBlockedLanguage('fucking amazing')).toBe(true);
  });

  it('normalises unicode lookalikes before matching', () => {
    // NFKC folds fullwidth forms, which is the cheapest bypass to try.
    expect(containsBlockedLanguage('ｆｕｃｋ')).toBe(true);
  });

  it('does not fire on words that merely contain a term mid-string', () => {
    // \b anchors the pattern, so these must pass — a filter that blocks
    // "Scunthorpe" is a filter users route around.
    expect(containsBlockedLanguage('Scunthorpe')).toBe(false);
    expect(containsBlockedLanguage('classic')).toBe(false);
  });
});
