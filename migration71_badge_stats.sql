-- Migration 71 — stats for the 70-badge collection.
-- Five counters the new badge set needs that nothing tracked before. All are
-- server-owned like the rest of the stat columns (section 36 of
-- supabase_migrations.sql): the client reads them off its own profile row and
-- can never write them, so no badge can be awarded by a tampered UPDATE.
-- Until this runs those badges simply sit unearned — utils/badges.js defaults
-- every one of these stats to 0 rather than guessing at a value.
--
-- ── Why this asserts before it applies ───────────────────────────────────
-- plpgsql does NOT resolve column references inside a function body until the
-- function actually runs. A wrong column name here would create cleanly and
-- then break every comment insert and DM reaction on a live app, long after
-- the migration reported success. The guard below turns that into a loud
-- failure with nothing applied, inside a transaction.
--
-- This already earned its keep: the first draft of this migration counted a
-- `followers` table that migration68_friends_only.sql dropped on 2026-08-23.
-- The guard would have caught it; a review caught it first.
--
-- ── What is deliberately NOT here ────────────────────────────────────────
-- No followers_count. The follower graph was removed on purpose in 1.5.1
-- ("MangaRecs now has one relationship between two people: a friendship both
-- sides agreed to"), so a badge counting followers would reintroduce a concept
-- the product dropped. The "Popular User" badge now reads profiles.friends_count,
-- which survives and is already maintained.

BEGIN;

DO $guard$
DECLARE
  missing TEXT := '';
  expected TEXT[][] := ARRAY[
    ['comments',             'parent_id'],
    ['comments',             'user_id'],
    ['dm_message_reactions', 'user_id'],
    ['reading_progress',     'user_id'],
    ['reading_progress',     'series_title'],
    ['manga_pool',           'title'],
    ['manga_pool',           'lang'],
    ['profiles',             'id'],
    ['profiles',             'friends_count']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(expected, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = expected[i][1]
         AND column_name  = expected[i][2]
    ) THEN
      missing := missing || expected[i][1] || '.' || expected[i][2] || '  ';
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'migration 71 aborted — these columns do not exist: %', missing
      USING HINT = 'Fix the column names to match the real schema, then re-run. Nothing has been applied.';
  END IF;
END $guard$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekend_reads       INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manga_titles        INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manhwa_titles       INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discussions_started INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reactions_given     INTEGER DEFAULT 0;

-- Weekend reads. Mirrors increment_night_reads: the SERVER decides whether it
-- is the weekend, never the caller, so a device clock can't claim Saturday on
-- a Tuesday. Rate limited the same way to cap a single day's contribution.
CREATE OR REPLACE FUNCTION increment_weekend_reads()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF EXTRACT(DOW FROM now()) NOT IN (0, 6) THEN RETURN; END IF;
  PERFORM consume_rate(auth.uid(), 'weekend_reads', 5, INTERVAL '24 hours');
  UPDATE profiles SET weekend_reads = COALESCE(weekend_reads, 0) + 1 WHERE id = auth.uid();
END; $$;
REVOKE ALL ON FUNCTION increment_weekend_reads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_weekend_reads() TO authenticated;

-- Distinct manga vs manhwa titles, derived rather than counted incrementally so
-- it stays correct if reading_progress is edited or back-filled. Language comes
-- from manga_pool (ja = manga, ko = manhwa); a title not in the pool counts for
-- neither rather than being guessed at.
CREATE OR REPLACE FUNCTION refresh_format_counts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_manga INTEGER; v_manhwa INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT
    COUNT(DISTINCT rp.series_title) FILTER (WHERE mp.lang = 'ja'),
    COUNT(DISTINCT rp.series_title) FILTER (WHERE mp.lang = 'ko')
  INTO v_manga, v_manhwa
  FROM reading_progress rp
  JOIN manga_pool mp ON lower(trim(mp.title)) = lower(trim(rp.series_title))
  WHERE rp.user_id = auth.uid();
  UPDATE profiles
     SET manga_titles  = COALESCE(v_manga, 0),
         manhwa_titles = COALESCE(v_manhwa, 0)
   WHERE id = auth.uid();
END; $$;
REVOKE ALL ON FUNCTION refresh_format_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_format_counts() TO authenticated;

-- Discussions started = top-level comments only (a reply is not a discussion).
CREATE OR REPLACE FUNCTION sync_discussions_started()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE target UUID;
BEGIN
  target := COALESCE(NEW.user_id, OLD.user_id);
  UPDATE profiles SET discussions_started = (
    SELECT COUNT(*) FROM comments WHERE user_id = target AND parent_id IS NULL
  ) WHERE id = target;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_discussions_started ON comments;
CREATE TRIGGER trg_sync_discussions_started
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION sync_discussions_started();

-- Reactions given on DM messages.
CREATE OR REPLACE FUNCTION sync_reactions_given()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE target UUID;
BEGIN
  target := COALESCE(NEW.user_id, OLD.user_id);
  UPDATE profiles SET reactions_given = (
    SELECT COUNT(*) FROM dm_message_reactions WHERE user_id = target
  ) WHERE id = target;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_reactions_given ON dm_message_reactions;
CREATE TRIGGER trg_sync_reactions_given
AFTER INSERT OR DELETE ON dm_message_reactions
FOR EACH ROW EXECUTE FUNCTION sync_reactions_given();

-- Back-fill the derived counters so existing readers get credit for history
-- they already have, rather than every one of these badges starting at zero.
UPDATE profiles p SET
  discussions_started = (SELECT COUNT(*) FROM comments c WHERE c.user_id = p.id AND c.parent_id IS NULL),
  reactions_given     = (SELECT COUNT(*) FROM dm_message_reactions r WHERE r.user_id = p.id);

-- refresh_format_counts() only ever touches the caller's own row, so it cannot
-- do this; without it an existing reader shows zero manga/manhwa until their
-- next read triggers a refresh.
UPDATE profiles p SET
  manga_titles = sub.manga, manhwa_titles = sub.manhwa
FROM (
  SELECT rp.user_id,
         COUNT(DISTINCT rp.series_title) FILTER (WHERE mp.lang = 'ja') AS manga,
         COUNT(DISTINCT rp.series_title) FILTER (WHERE mp.lang = 'ko') AS manhwa
    FROM reading_progress rp
    JOIN manga_pool mp ON lower(trim(mp.title)) = lower(trim(rp.series_title))
   GROUP BY rp.user_id
) sub
WHERE p.id = sub.user_id;

COMMIT;

-- weekend_reads has no back-fill: nothing recorded which day a past read
-- happened on, and inventing one would hand out a badge nobody earned. It
-- starts at 0 for everyone and counts forward.
--
-- badge_rarity (section 37) knows requirement types by a CASE over column
-- names and does not yet know these five. Until it is re-issued whole,
-- utils/badges.js holds them back from the rarity call on purpose — see
-- RARITY_TYPES there — so the effect is a missing line of flavour text, not a
-- failed request.
--
-- NOT YET APPLIED. The access tokens supplied on 2026-10-01 could not be used.
-- Stamp this footer once it has run.
