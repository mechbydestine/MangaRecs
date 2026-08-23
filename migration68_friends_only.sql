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

-- REVOKE FROM PUBLIC is NOT enough on Supabase. The project's default
-- privileges grant EXECUTE on every new public function directly to anon,
-- authenticated and service_role, and a direct grant survives a revoke aimed
-- at PUBLIC. Without the anon line below, this function ships callable by
-- anyone holding the (publicly shipped) anon key. It is SECURITY DEFINER, so
-- that is the difference between "bypasses RLS on behalf of a signed-in user"
-- and "bypasses RLS, full stop" — the auth.uid() IS NOT NULL guard inside is
-- the only thing that would have been standing between the two.
REVOKE ALL ON FUNCTION public.get_mutual_friends(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mutual_friends(UUID) TO authenticated;

-- ── 3. Index the accepted-friendship lookups this adds ──────────────────────
-- Already present from section 46, restated so this file stands alone.
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);

-- ── 4. Same hole, same shape, on the RPCs that were already here ────────────
-- Every one of these says "REVOKE ALL FROM PUBLIC / GRANT TO authenticated" in
-- its own migration and every one of them was anon-callable in production for
-- the same reason. All three key off auth.uid() internally, so anon never got
-- rows out of them — but that is the guard doing the work, not the grant, and
-- one refactor that reads a user id from a parameter instead would have turned
-- a closed door into an open one.
--
-- is_blocked_pair is deliberately NOT touched here: it is called from inside a
-- RESTRICTIVE RLS policy on direct_messages, where EXECUTE is evaluated as the
-- calling role, and it carries a PUBLIC grant the others don't. Narrowing it
-- belongs in its own change with its own DM test, not as a footnote to this one.
REVOKE ALL ON FUNCTION public.get_suggested_friends(UUID, INT)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friends_recap_totals(DATE, DATE)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friend_reading_stats(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_friends(UUID, INT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_recap_totals(DATE, DATE)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_reading_stats(UUID, DATE, DATE) TO authenticated;

-- APPLIED 2026-08-23 via the Management API, immediately after publishing the
-- matching OTA to `preview` (update 06239e10 / fdaf62d4, commit e747e24) so the
-- window where a client could call get_mutual_friends before it existed was a
-- few seconds rather than the length of a bundle upload.
--
-- Verified before: followers still present, get_mutual_friends absent, and the
-- app had already been moved off the followers table (1 remaining reference,
-- a comment). Migrations 62/65/66 were confirmed already applied, and 67 too —
-- launch_notify, site_events and launch_notify_count() all exist, so the
-- waitlist and the page counter were never silently failing.
--
-- Verified after: followers gone, get_mutual_friends present and SECURITY
-- DEFINER, EXECUTE granted to `authenticated` and not to `anon`, 0 notifications
-- of type 'follow' remain, both friendship indexes present, and all 9
-- friendship rows preserved.
