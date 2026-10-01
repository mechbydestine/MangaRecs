import { supabase } from '../supabase';

// Cached per current-user Set of blocked ids — several screens call
// getBlockedIds on every load (friends list, DM list, suggested friends),
// so a short-lived cache avoids redundant round-trips. Invalidated on any
// block/unblock.
let _cache = null;
let _cacheUserId = null;

export async function getBlockedIds(userId) {
  if (!userId) return new Set();
  if (_cache && _cacheUserId === userId) return _cache;
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId);
  if (error || !data) return new Set();
  _cache = new Set(data.map((r) => r.blocked_id));
  _cacheUserId = userId;
  return _cache;
}

// Both directions of the block relationship. getBlockedIds above only covers
// people *I* blocked, which is right for filtering my own friends/DM lists —
// but for discovery (username search, sending a friend request) the symmetric
// case matters too: someone who blocked me must not be reachable by searching
// their handle, and the friendships table has no RESTRICTIVE block policy of
// its own the way direct_messages does, so this is the only thing stopping it.
let _eitherCache = null;
let _eitherCacheUserId = null;

export async function getBlockedEitherWay(userId) {
  if (!userId) return new Set();
  if (_eitherCache && _eitherCacheUserId === userId) return _eitherCache;
  const [mine, theirs] = await Promise.all([
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
    supabase.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
  ]);
  if (mine.error || theirs.error) return new Set();
  const union = new Set([
    ...(mine.data || []).map((r) => r.blocked_id),
    ...(theirs.data || []).map((r) => r.blocker_id),
  ]);
  _eitherCache = union;
  _eitherCacheUserId = userId;
  return union;
}

function invalidateCache() {
  _cache = null;
  _cacheUserId = null;
  _eitherCache = null;
  _eitherCacheUserId = null;
}

export async function blockUser(myId, targetId) {
  if (!myId || !targetId) return { error: new Error('Missing user id') };
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: myId, blocked_id: targetId });
  if (error) return { error };
  invalidateCache();
  // Blocking someone also ends the friendship, if any
  await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${myId})`
    );
  return { error: null };
}

export async function unblockUser(myId, targetId) {
  if (!myId || !targetId) return { error: new Error('Missing user id') };
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', targetId);
  if (!error) invalidateCache();
  return { error };
}
