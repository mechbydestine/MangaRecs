import { supabase } from '../supabase';
import { fetchAndSeedMangaPool } from './mangadex';

// Run once from a dev menu or admin screen to top up manga_pool.
// Safe to call multiple times — uses upsert with onConflict: 'id'.
export default async function seedMangaPool(totalTarget = 500) {
  console.log(`[seedManga] Starting seed, target=${totalTarget}`);
  try {
    const count = await fetchAndSeedMangaPool(supabase, totalTarget);
    console.log(`[seedManga] Done — upserted ${count} entries`);
    return count;
  } catch (err) {
    console.error('[seedManga] Failed:', err.message);
    throw err;
  }
}
