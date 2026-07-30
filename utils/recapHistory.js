// ─────────────────────────────────────────────────────────────────────────
// MangaRecap — cross-period memory + friend comparison
//
// Everything here is additive and fails silent-empty. The `recap_snapshots`
// table and the two friend RPCs it calls (get_friends_recap_totals,
// get_friend_reading_stats) are defined in supabase_migrations.sql but must
// be applied by hand in the Supabase SQL editor — until that happens every
// function below simply returns null/[] instead of throwing, so shipping
// this file never breaks the recap for anyone still on the old schema.
//
// Pure helpers (readingDnaCode, ratingPersonality) take zero RN/Supabase
// imports on purpose — same rule as utils/recapIdentity.js — so a future
// web recap can import this file's maths without dragging in a client.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from '../supabase';

function localPeriodKey(period) {
  return period.start.toISOString().slice(0, 10);
}

/** The most recent snapshot strictly before this period, or null. */
export async function fetchPreviousSnapshot(userId, period) {
  try {
    const { data, error } = await supabase
      .from('recap_snapshots')
      .select('period_start,period_end,period_label,stats')
      .eq('user_id', userId)
      .lt('period_start', localPeriodKey(period))
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data.stats, periodLabel: data.period_label, periodStart: data.period_start };
  } catch (_) {
    return null;
  }
}

/** The single oldest snapshot on file — the reader's very first recorded recap. */
export async function fetchOldestSnapshot(userId) {
  try {
    const { data, error } = await supabase
      .from('recap_snapshots')
      .select('period_start,period_label,stats')
      .eq('user_id', userId)
      .order('period_start', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { ...data.stats, periodLabel: data.period_label, periodStart: data.period_start };
  } catch (_) {
    return null;
  }
}

/** Every snapshot on file, newest first — backs the Recap Vault. */
export async function fetchVault(userId) {
  try {
    const { data, error } = await supabase
      .from('recap_snapshots')
      .select('period_start,period_end,period_label,stats')
      .eq('user_id', userId)
      .order('period_start', { ascending: false });
    if (error) return [];
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Upserts this period's snapshot so a future recap can diff against it.
 * Fire-and-forget by design — callers should not await this on the critical
 * render path. Silently a no-op until the migration is applied.
 */
export async function saveSnapshot(userId, period, stats) {
  try {
    await supabase.from('recap_snapshots').upsert({
      user_id: userId,
      period_start: localPeriodKey(period),
      period_end: period.end.toISOString().slice(0, 10),
      period_label: period.label,
      stats,
    }, { onConflict: 'user_id,period_start' });
  } catch (_) {
    // Best-effort — a reader should never see an error for this.
  }
}

/** Every accepted friend's chapter total + top series for this period. */
export async function fetchFriendsRecap(period) {
  try {
    const { data, error } = await supabase.rpc('get_friends_recap_totals', {
      p_start: localPeriodKey(period),
      p_end: period.end.toISOString().slice(0, 10),
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (_) {
    return [];
  }
}

/** One specific friend's raw reading rows for this period (must be mutual friends). */
export async function fetchFriendDetail(friendId, period) {
  try {
    const { data, error } = await supabase.rpc('get_friend_reading_stats', {
      p_friend_id: friendId,
      p_start: localPeriodKey(period),
      p_end: period.end.toISOString().slice(0, 10),
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (_) {
    return [];
  }
}

// ── pure maths — no imports, safe for a future web build ─────────────────

const MODE_TAG = { print: 'PRINT', webtoon: 'SCROLL', inkwash: 'BRUSH', neo: 'EDITORIAL' };
const LANE_TAG = {
  battle: 'BATTLE', pitch: 'PITCH', quest: 'QUEST', dread: 'DREAD',
  heart: 'HEART', calm: 'CALM', circuit: 'CIRCUIT', occult: 'OCCULT',
};

/** A short, shareable "reading DNA" code — a poster stamp, not a slide. */
export function readingDnaCode(identity, genres) {
  const mode = MODE_TAG[identity.modeKey] || 'EDITORIAL';
  const lane = LANE_TAG[identity.lane] || 'QUEST';
  const pct = genres && genres[0] ? genres[0].pct : 0;
  return `${mode}·${lane}·${pct}`;
}

/**
 * Compares the reader's own star ratings against the community average on
 * the same titles. `mine`/`community` are [{ series_title, stars }] — the
 * caller does the two Supabase reads (series_ratings is public-read, no RPC
 * needed) and hands the rows in here.
 */
export function ratingPersonality(mine, community) {
  if (!mine || !mine.length) return null;
  const avgByTitle = {};
  (community || []).forEach((r) => {
    if (!avgByTitle[r.series_title]) avgByTitle[r.series_title] = { sum: 0, n: 0 };
    avgByTitle[r.series_title].sum += r.stars;
    avgByTitle[r.series_title].n += 1;
  });
  let deltaSum = 0, counted = 0;
  mine.forEach((r) => {
    const bucket = avgByTitle[r.series_title];
    if (!bucket || bucket.n < 2) return; // need at least one other rater to mean anything
    deltaSum += r.stars - bucket.sum / bucket.n;
    counted += 1;
  });
  if (!counted) return null;
  const delta = deltaSum / counted;
  if (Math.abs(delta) < 0.4) return { delta, label: 'Right on the community average' };
  return delta > 0
    ? { delta, label: `About ${delta.toFixed(1)} pts more generous than most readers` }
    : { delta, label: `About ${Math.abs(delta).toFixed(1)} pts harsher than most readers` };
}
