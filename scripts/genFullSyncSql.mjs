// One-time generator — run with: node scripts/genFullSyncSql.mjs
// Produces sync-manga-pool.sql: syncs title/description/genres/rating/cover_url
// on the live manga_pool table's curated rows from the canon utils/mangaPool.js
// + utils/mangaPoolCovers.js, using a VALUES-based UPDATE (one round trip,
// not 729 separate statements). Only touches ids that already exist as rows —
// never inserts new ones.
import { MANGA_POOL } from '../utils/mangaPool.js';
import { POOL_COVER_URLS } from '../utils/mangaPoolCovers.js';
import { writeFileSync } from 'fs';

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}
function sqlArray(arr) {
  return `ARRAY[${(arr || []).map((g) => `'${sqlEscape(g)}'`).join(',')}]::text[]`;
}

const rows = MANGA_POOL.map((m) => {
  const cover = POOL_COVER_URLS[m.id] || null;
  return `  ('${m.id}', '${sqlEscape(m.title)}', '${sqlEscape(m.description || '')}', ${sqlArray(m.genres)}, ${typeof m.rating === 'number' ? m.rating : 'NULL'}, ${cover ? `'${sqlEscape(cover)}'` : 'NULL'})`;
}).join(',\n');

const sql = `-- Sync manga_pool live table from the canon utils/mangaPool.js + baked
-- covers (2026-07-15). Only affects rows whose id already exists in
-- manga_pool (the ~211-229 curated rows) — run AFTER deleting the raw
-- MangaDex-scraped rows (see delete-scraped-manga-pool-rows.sql) so this
-- becomes the only data source get_personalized_feed() draws from.
-- Safe to re-run.

UPDATE manga_pool AS mp
SET
  title       = v.title,
  description = v.description,
  genres      = v.genres,
  rating      = COALESCE(v.rating, mp.rating),
  cover_url   = COALESCE(v.cover_url, mp.cover_url)
FROM (VALUES
${rows}
) AS v(id, title, description, genres, rating, cover_url)
WHERE mp.id = v.id;
`;

writeFileSync(new URL('./sync-manga-pool.sql', import.meta.url), sql, 'utf8');
console.log(`Wrote sync-manga-pool.sql — ${MANGA_POOL.length} candidate rows (only matching ids will actually update).`);
