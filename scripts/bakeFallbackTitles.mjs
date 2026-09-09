// Bakes a small offline copy of the curated pool for the homepage rails to
// fall back on — run with: node scripts/bakeFallbackTitles.mjs
//
// Trending Right Now and Newly Growing are both live AniList queries, so when
// AniList is unreachable the homepage's two main content rails go from "the
// site" to an apology. That is not hypothetical: AniList returned 403 with
// "temporarily disabled due to severe stability issues" for the whole of the
// session this was written in, and both rails were dead on the live site.
//
// The pool in utils/ is real curated data with covers already baked, but it
// lives outside docs/ so the site can't read it. This copies just enough of it
// into docs/assets/ in AniList's own response shape, so posterCard() renders
// it without a second code path.
//
// Re-run when utils/mangaPool.js changes.

import { MANGA_POOL } from '../utils/mangaPool.js';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../docs/assets/fallback-titles.json');

const FORMAT_BY_LANG = { ja: 'MANGA', ko: 'MANHWA', zh: 'MANHUA', en: 'NOVEL' };
const COUNTRY_BY_LANG = { ja: 'JP', ko: 'KR', zh: 'CN', en: 'US' };
const PER_RAIL = 24;

// Shaped like an AniList media node on purpose — posterCard() reads
// coverImage.extraLarge, title.english, averageScore and so on, and giving it
// the same shape means the fallback path is a data swap, not a second
// renderer that can drift from the real one.
function toMediaShape(m) {
  const cover = POOL_COVER_URLS[m.id] || null;
  return {
    id: m.id,
    title: { english: m.title, romaji: m.title, native: null },
    coverImage: { extraLarge: cover, large: cover },
    genres: m.genres || [],
    format: FORMAT_BY_LANG[m.lang] || 'MANGA',
    countryOfOrigin: COUNTRY_BY_LANG[m.lang] || null,
    status: m.status === 'completed' ? 'FINISHED' : 'RELEASING',
    chapters: m.chapters || null,
    volumes: null,
    averageScore: m.rating ? Math.round(m.rating * 10) : null,
    popularity: m.likeCount || 0,
    favourites: m.likeCount || 0,
    startDate: { year: null },
    description: m.description || '',
  };
}

const usable = MANGA_POOL.filter((m) => !m.nsfw && m.description && POOL_COVER_URLS[m.id]);

const byRating = (a, b) => (b.rating || 0) - (a.rating || 0);

// Trending's stand-in: the best-rated of the pool, any origin.
const trending = usable.slice().sort(byRating).slice(0, PER_RAIL);

// Newly Growing's stand-in has to match what that rail is for — manhwa and
// manhua, well rated, still short. Same shape of pick the live query makes,
// just against local data.
const growing = usable
  .filter((m) => (m.lang === 'ko' || m.lang === 'zh') && (m.chapters || 0) > 0 && (m.chapters || 0) < 100)
  .sort(byRating)
  .slice(0, PER_RAIL);

const payload = {
  generatedAt: new Date().toISOString(),
  note: 'Offline stand-in for the homepage rails when the AniList API is unreachable. Curated pool data, not live.',
  trending: trending.map(toMediaShape),
  growing: growing.map(toMediaShape),
};

writeFileSync(OUT, JSON.stringify(payload));

console.log(`Wrote docs/assets/fallback-titles.json`);
console.log(`  trending stand-ins: ${payload.trending.length}`);
console.log(`  growing stand-ins:  ${payload.growing.length}`);
