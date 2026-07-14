import { supabase } from '../supabase';

// Rates a series 1-10 points (half-star granularity over 5 stars), then nudges
// the rater's genre weights so the rating actually feeds recommendations
// (reuses the same RPC/scale ForYou's swipe dismiss/save already uses:
// dismiss=-2, save=+2).
export async function rateSeries(userId, seriesTitle, points, genres = []) {
  if (!userId || !seriesTitle || points < 1 || points > 10) return null;

  const { data, error } = await supabase.rpc('rate_series', {
    p_series_title: seriesTitle,
    p_stars: points,
  });
  if (error) throw error;

  // Converted back to the old 1-5 star-equivalent so the tuning (±3 max nudge)
  // stays identical to before the 10-point switch.
  const starsEquiv = points / 2;
  const delta = (starsEquiv - 3) * 1.5; // 1★=-3, 2★=-1.5, 3★=0, 4★=+1.5, 5★=+3
  if (delta !== 0 && genres?.length) {
    genres.forEach((genre) => {
      supabase.rpc('upsert_genre_weight', { p_user_id: userId, p_genre: genre, p_delta: delta }).then(() => {});
    });
  }
  return data; // { avg, count, yourRating }
}

export async function getSeriesRating(seriesTitle) {
  if (!seriesTitle) return { avg: 0, count: 0, yourRating: null };
  const { data, error } = await supabase.rpc('get_series_rating', { p_series_title: seriesTitle });
  if (error) return { avg: 0, count: 0, yourRating: null };
  return data;
}
