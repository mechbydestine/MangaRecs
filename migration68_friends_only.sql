-- ============================================================================
-- migration68_friends_only.sql
--
-- Removes the follower graph. MangaRecs now has exactly one relationship
-- between two people, the Discord one: a friendship, which both sides opted
-- into (request -> accept) and either side can end.
--
-- Why: `followers` was a second, one-directional graph layered on top of
-- `friendships`, and it earned nothing. Following someone gave no access
-- friendship didn't already give (profiles are world-readable, DMs are gated
-- on blocks, not on follows), it produced a "Followers / Following" pair of
-- vanity counters on every profile, and it split "do I know this person" into
-- two answers that could disagree — you could be following someone who had
-- blocked you as a friend. One symmetric, consented edge is the whole model.
--
-- Nothing here reads the follow rows before dropping them: there is no
-- follower state worth migrating into friendships. A follow was never mutual
-- and was never accepted by the other side, so promoting follows to
-- friendships would be inventing consent that was never given. Anyone who
-- wants the relationship sends a friend request, same as everyone else.
--
-- Safe to re-run.
-- ============================================================================

-- ── 1. Drop the follower graph ──────────────────────────────────────────────
-- CASCADE takes the table's policies and indexes with it.
DROP TABLE IF EXISTS public.followers CASCADE;

-- The notifications those rows produced ("X started following you") now point
-- at a relationship that no longer exists, and nothing in the app renders the
-- 'follow' type any more — it would show as a blank row.
DELETE FROM public.notifications WHERE type = 'follow';

-- ── 2. get_mutual_friends: the friends you and one other person share ───────
-- Replaces "Followers / Following" on someone else's profile with Discord's
-- Mutual Friends.
--
-- This has to be SECURITY DEFINER. friendships RLS only exposes rows the
-- caller is a party to (by design — your friend list is not public), so a
-- direct client query for "who is this person friends with" can only ever come
-- back with the single row that is me. The definer rights are narrowed by what
-- the function can return: a profile only appears if it is an accepted friend
-- of BOTH sides, so the caller learns nothing about the target's friendships
-- beyond the ones they are already inside. That is exactly the Discord rule.
--
-- Blocked pairs are filtered in both directions so a block stays invisible.
CREATE OR REPLACE FUNCTION public.get_mutual_friends(p_user_id UUID)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, avatar_url TEXT, online BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
  ),
  theirs AS (
    SELECT CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
  )
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.online
  FROM profiles p
  JOIN mine   m  ON m.fid  = p.id
  JOIN theirs th ON th.fid = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
  ORDER BY p.online DESC NULLS LAST, COALESCE(p.display_name, p.username);
$$;

REVOKE ALL ON FUNCTION public.get_mutual_friends(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mutual_friends(UUID) TO authenticated;

-- ── 3. Index the accepted-friendship lookups this adds ──────────────────────
-- Already present from section 46, restated so this file stands alone.
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
