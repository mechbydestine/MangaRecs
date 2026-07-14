-- ─────────────────────────────────────────────────────────────────────────────
-- MangaRecs — paste this entire file into the Supabase SQL Editor and run it.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Comments (Chapter Discussion + Feed post comments)
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title TEXT NOT NULL DEFAULT 'General',
  text TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  spoiler BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read comments"  ON comments;
DROP POLICY IF EXISTS "Auth insert comments"  ON comments;
DROP POLICY IF EXISTS "Own delete comments"   ON comments;
CREATE POLICY "Public read comments"  ON comments FOR SELECT USING (true);
CREATE POLICY "Auth insert comments"  ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete comments"   ON comments FOR DELETE USING (auth.uid() = user_id);

-- 2. Series (Creator Dashboard uploads)
CREATE TABLE IF NOT EXISTS series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  status TEXT DEFAULT 'ongoing',
  chapters INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read series"  ON series;
DROP POLICY IF EXISTS "Auth insert series"  ON series;
DROP POLICY IF EXISTS "Own update series"   ON series;
DROP POLICY IF EXISTS "Own delete series"   ON series;
CREATE POLICY "Public read series"  ON series FOR SELECT USING (true);
CREATE POLICY "Auth insert series"  ON series FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Own update series"   ON series FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Own delete series"   ON series FOR DELETE USING (auth.uid() = creator_id);

-- 3. Reading progress (Library "Reading" / "Completed" tabs)
CREATE TABLE IF NOT EXISTS reading_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title TEXT NOT NULL,
  current_chapter INTEGER DEFAULT 1,
  total_chapters INTEGER,
  status TEXT DEFAULT 'reading',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, series_title)
);
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own read progress"    ON reading_progress;
DROP POLICY IF EXISTS "Own insert progress"  ON reading_progress;
DROP POLICY IF EXISTS "Own update progress"  ON reading_progress;
DROP POLICY IF EXISTS "Own delete progress"  ON reading_progress;
CREATE POLICY "Own read progress"    ON reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own insert progress"  ON reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own update progress"  ON reading_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own delete progress"  ON reading_progress FOR DELETE USING (auth.uid() = user_id);

-- 4. Push notification token + personalisation columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genre_weights      JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_site       JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reading_vibe       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reading_frequency  TEXT;

-- 5a. delete_user RPC — deletes the calling user's auth record (cascades to all their data)
CREATE OR REPLACE FUNCTION delete_user()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- 5b. increment_chapters_read RPC (called when user opens a new title per session)
CREATE OR REPLACE FUNCTION increment_chapters_read(uid UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET chapters_read = COALESCE(chapters_read, 0) + 1 WHERE id = uid;
END;
$$;

-- 6. Notifications (friend requests, likes, comments)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own read notifications"    ON notifications;
DROP POLICY IF EXISTS "Own update notifications"  ON notifications;
DROP POLICY IF EXISTS "Auth insert notifications" ON notifications;
DROP POLICY IF EXISTS "Own delete notifications"  ON notifications;
CREATE POLICY "Own read notifications"    ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own update notifications"  ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Auth insert notifications" ON notifications FOR INSERT WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);
CREATE POLICY "Own delete notifications"  ON notifications FOR DELETE USING (auth.uid() = user_id);

-- 7. Post likes (cross-device like state for Feed)
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, series_title)
);
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own read likes"   ON post_likes;
DROP POLICY IF EXISTS "Own insert likes" ON post_likes;
DROP POLICY IF EXISTS "Own delete likes" ON post_likes;
CREATE POLICY "Own read likes"   ON post_likes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own insert likes" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete likes" ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- 8. Supabase Storage bucket for ambient audio (run once)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sounds', 'sounds', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Public read sounds" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload sounds" ON storage.objects;
CREATE POLICY "Public read sounds"
  ON storage.objects FOR SELECT USING (bucket_id = 'sounds');
CREATE POLICY "Auth upload sounds"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sounds' AND auth.role() = 'authenticated');

-- 9. Legal compliance — community guidelines gate + content reporting
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accepted_guidelines   BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS guidelines_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content_id   TEXT NOT NULL,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  resolved     BOOLEAN DEFAULT false
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can report"          ON reports;
DROP POLICY IF EXISTS "service role read reports" ON reports;
CREATE POLICY "users can report"
  ON reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "service role read reports"
  ON reports FOR SELECT
  USING (auth.role() = 'service_role');

-- 10. Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can request friends"        ON friendships;
DROP POLICY IF EXISTS "parties can read their friendships" ON friendships;
DROP POLICY IF EXISTS "addressee can accept or decline"  ON friendships;
DROP POLICY IF EXISTS "parties can delete friendship"    ON friendships;
CREATE POLICY "users can request friends"
  ON friendships FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY "parties can read their friendships"
  ON friendships FOR SELECT
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "addressee can accept or decline"
  ON friendships FOR UPDATE
  USING (addressee_id = auth.uid());
CREATE POLICY "parties can delete friendship"
  ON friendships FOR DELETE
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- 11. Missing profile columns used throughout the app
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio               TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color             TEXT    DEFAULT 'default';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currently_reading TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_chapter   INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chapters_read     INTEGER         DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hours_read        NUMERIC(10,4)   DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_count      INTEGER         DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_genre    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_log         JSONB           DEFAULT '{}';
-- Badge stat columns (used by leaderboard badge computation)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friends_count     INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS comments_count    INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS likes_given       INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS series_count      INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completed_count   INTEGER DEFAULT 0;
-- Fix hours_read column from INTEGER to NUMERIC so sub-1h sessions aren't lost
ALTER TABLE profiles ALTER COLUMN hours_read TYPE NUMERIC(10,4) USING hours_read::NUMERIC;

-- ── 15. Fix delete_user: explicitly delete profile before auth user ──────────
-- The previous version only deleted from auth.users; if ON DELETE CASCADE was
-- not set on profiles.id the profile row would remain and show in suggested.
-- Run this in Supabase SQL Editor to replace the old function.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Remove profile first so no FK violation if CASCADE is not set
  DELETE FROM public.profiles WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;


-- ── 16. One-time cleanup: remove orphaned + duplicate profiles ───────────────
-- Run this ONCE in the Supabase SQL Editor (it is idempotent but queries auth).

-- Step 1: delete profile rows whose auth.users entry no longer exists
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);

-- Step 2: for any remaining duplicate usernames keep the oldest row
DELETE FROM public.profiles p1
USING public.profiles p2
WHERE lower(p1.username) = lower(p2.username)
  AND p1.id <> p2.id
  AND p1.created_at > p2.created_at;

-- Step 3: ensure profiles.id cascades when auth user is deleted
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 17. Threaded comments, comment likes, and fix author name join ────────────

-- Fix column names to match what the app inserts/selects
ALTER TABLE comments RENAME COLUMN content TO text;
ALTER TABLE comments RENAME COLUMN is_spoiler TO spoiler;

-- Fix: change comments.user_id FK to reference profiles(id) instead of auth.users(id).
-- This allows PostgREST to resolve the 'author:user_id(username)' join correctly,
-- because auth.users has no username column but profiles does.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Threaded replies support
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_id);

-- Comment likes (cross-device, per-user like state)
CREATE TABLE IF NOT EXISTS comment_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, comment_id)
);
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own read comment_likes"   ON comment_likes;
DROP POLICY IF EXISTS "Own insert comment_likes" ON comment_likes;
DROP POLICY IF EXISTS "Own delete comment_likes" ON comment_likes;
CREATE POLICY "Own read comment_likes"   ON comment_likes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own insert comment_likes" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete comment_likes" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- Atomic comment like/unlike RPC (prevents double-counting race conditions)
CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  was_liked BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM comment_likes WHERE user_id = uid AND comment_id = p_comment_id
  ) INTO was_liked;
  IF was_liked THEN
    DELETE FROM comment_likes WHERE user_id = uid AND comment_id = p_comment_id;
    UPDATE comments SET likes = GREATEST(likes - 1, 0) WHERE id = p_comment_id;
  ELSE
    INSERT INTO comment_likes(user_id, comment_id) VALUES (uid, p_comment_id) ON CONFLICT DO NOTHING;
    UPDATE comments SET likes = likes + 1 WHERE id = p_comment_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION toggle_comment_like(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toggle_comment_like(UUID) TO authenticated;

-- ── 18. Fix FK joins: point notifications.actor_id and friendships to profiles ─
-- Root cause: friendships and notifications had actor/requester/addressee FKs
-- pointing at auth.users(id). PostgREST can only join columns that exist on the
-- target table, and auth.users has no username/color/currently_reading columns.
-- All those fields live in profiles, so the FK must point there instead.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_requester_id_fkey;
ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_addressee_id_fkey;
ALTER TABLE friendships ADD CONSTRAINT friendships_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE friendships ADD CONSTRAINT friendships_addressee_id_fkey
  FOREIGN KEY (addressee_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ── 19. Missing profile columns used by badge engine ─────────────────────────
-- profileToBadgeStats() and BADGE_STAT_FIELDS reference these columns to unlock
-- badge tiers (midnight reader, genre explorer, etc.) but they were never added.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS night_reads   INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genres_count  INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shares_count  INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manga_count   INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ratings_count INTEGER DEFAULT 0;
-- created_at is used for account_age badge; Supabase adds it automatically but
-- make it explicit so it survives schema resets.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT now();

-- ── 20. Avatars storage bucket ───────────────────────────────────────────────
-- ProfileContext.uploadAvatar() calls supabase.storage.from('avatars') but the
-- bucket was never created in migrations.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Own delete avatars"  ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Auth upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Own delete avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 21. Activity Feed ────────────────────────────────────────────────────────
-- Stores community events (comments, badges, completions) shown in Social screen.

CREATE TABLE IF NOT EXISTS activity_feed (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  data       JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_feed_created_at_idx ON activity_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_feed_user_id_idx    ON activity_feed (user_id);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read activity"  ON activity_feed;
DROP POLICY IF EXISTS "Own insert activity"   ON activity_feed;
DROP POLICY IF EXISTS "Own delete activity"   ON activity_feed;
CREATE POLICY "Public read activity"  ON activity_feed FOR SELECT USING (true);
CREATE POLICY "Own insert activity"   ON activity_feed FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete activity"   ON activity_feed FOR DELETE USING (auth.uid() = user_id);

-- ── 22. Community Polls ──────────────────────────────────────────────────────
-- Weekly poll + per-user votes shown in Social screen.

CREATE TABLE IF NOT EXISTS community_polls (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  question   TEXT        NOT NULL,
  options    JSONB       NOT NULL,
  week_key   TEXT        NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (week_key)
);
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read polls" ON community_polls;
CREATE POLICY "Public read polls" ON community_polls FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read poll votes" ON poll_votes;
DROP POLICY IF EXISTS "Own insert poll votes"  ON poll_votes;
CREATE POLICY "Public read poll votes" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "Own insert poll votes"  ON poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RPC: get (or auto-create) the current week's poll ──────────────────────────
CREATE OR REPLACE FUNCTION get_or_create_weekly_poll()
RETURNS SETOF community_polls LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wkey      TEXT    := TO_CHAR(NOW(), 'IYYY-IW');
  week_idx  INTEGER := EXTRACT(WEEK FROM NOW())::INTEGER % 10;
  q_text    TEXT;
  q_opts    JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM community_polls WHERE week_key = wkey) THEN
    RETURN QUERY SELECT * FROM community_polls WHERE week_key = wkey;
    RETURN;
  END IF;

  CASE week_idx
    WHEN 0 THEN
      q_text := 'Best shounen drop right now?';
      q_opts := '[{"id":"jjk","label":"Jujutsu Kaisen"},{"id":"cm","label":"Chainsaw Man"},{"id":"bl","label":"Blue Lock"},{"id":"dd","label":"Dandadan"}]';
    WHEN 1 THEN
      q_text := 'Top manhwa right now?';
      q_opts := '[{"id":"sl","label":"Solo Leveling"},{"id":"or","label":"Omniscient Reader"},{"id":"ssh","label":"SSS-Class Hunter"},{"id":"rm","label":"Regressor Manual"}]';
    WHEN 2 THEN
      q_text := 'Most emotional manga ever?';
      q_opts := '[{"id":"vs","label":"Vinland Saga"},{"id":"fri","label":"Frieren"},{"id":"ber","label":"Berserk"},{"id":"pnp","label":"Goodnight Punpun"}]';
    WHEN 3 THEN
      q_text := 'Best power system in manga?';
      q_opts := '[{"id":"hxh","label":"HxH - Nen"},{"id":"jjk2","label":"JJK - Cursed Energy"},{"id":"sl2","label":"Solo Leveling - System"},{"id":"tog","label":"Tower of God - Shinsu"}]';
    WHEN 4 THEN
      q_text := 'Best isekai or regression series?';
      q_opts := '[{"id":"sl3","label":"Solo Leveling"},{"id":"omv","label":"Omniscient Reader"},{"id":"ssh2","label":"SSS-Class Hunter"},{"id":"mt","label":"Mushoku Tensei"}]';
    WHEN 5 THEN
      q_text := 'Best ongoing webtoon?';
      q_opts := '[{"id":"wh","label":"Weak Hero"},{"id":"wb","label":"Wind Breaker"},{"id":"lk","label":"Lookism"},{"id":"me","label":"Mercenary Enrollment"}]';
    WHEN 6 THEN
      q_text := 'Most underrated series right now?';
      q_opts := '[{"id":"bp","label":"Blue Period"},{"id":"apoth","label":"Apothecary Diaries"},{"id":"sz","label":"SubZero"},{"id":"sh","label":"Shadow Slave"}]';
    WHEN 7 THEN
      q_text := 'Best romance manga or webtoon?';
      q_opts := '[{"id":"lo","label":"Lore Olympus"},{"id":"tb","label":"True Beauty"},{"id":"kg","label":"Kaguya-sama"},{"id":"sz2","label":"SubZero"}]';
    WHEN 8 THEN
      q_text := 'Which series deserves a reread?';
      q_opts := '[{"id":"fma","label":"Fullmetal Alchemist"},{"id":"dn","label":"Death Note"},{"id":"aot","label":"Attack on Titan"},{"id":"hxh2","label":"Hunter x Hunter"}]';
    ELSE
      q_text := 'Best villain in manga?';
      q_opts := '[{"id":"tkt","label":"Sukuna (JJK)"},{"id":"gr","label":"Griffith (Berserk)"},{"id":"kira","label":"Kira (Death Note)"},{"id":"gc","label":"Gu Changge (Fated)"}]';
  END CASE;

  INSERT INTO community_polls (question, options, week_key, ends_at)
  VALUES (q_text, q_opts, wkey, DATE_TRUNC('week', NOW()) + INTERVAL '7 days')
  ON CONFLICT (week_key) DO NOTHING;

  RETURN QUERY SELECT * FROM community_polls WHERE week_key = wkey;
END;
$$;
REVOKE ALL ON FUNCTION get_or_create_weekly_poll() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_create_weekly_poll() TO authenticated, anon;

-- RPC: cast or change a vote atomically ──────────────────────────────────────
CREATE OR REPLACE FUNCTION cast_poll_vote(p_poll_id UUID, p_option_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO poll_votes (poll_id, user_id, option_id)
  VALUES (p_poll_id, auth.uid(), p_option_id)
  ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now();
END;
$$;
REVOKE ALL ON FUNCTION cast_poll_vote(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cast_poll_vote(UUID, TEXT) TO authenticated;

-- ── 23. Favorites column on profiles ────────────────────────────────────────
-- Stores the user's pinned favorite series as JSONB so friends can see them.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorites JSONB DEFAULT '[]'::jsonb;

-- ── 24. Public profiles SELECT + storage UPDATE policy ───────────────────────
-- Without a public SELECT policy on profiles, FriendProfileScreen gets null data
-- (RLS filters out rows where auth.uid() != id) causing blank avatar/genre/etc.
-- The storage UPDATE policy is required for upsert to work on existing avatar files.

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Own update avatars" ON storage.objects;
CREATE POLICY "Own update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 25. Creator Dashboard — views tracking & unique reader count ─────────────
-- increment_series_views: fire-and-forget when a reader opens a creator series.
-- count_creator_readers: distinct user_ids across all of a creator's series
-- (bypasses RLS on reading_progress so the creator can see aggregate counts).

CREATE OR REPLACE FUNCTION public.increment_series_views(p_series_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.series SET views = views + 1 WHERE id = p_series_id;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_series_views(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_series_views(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_creator_readers(p_creator_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reader_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT rp.user_id) INTO reader_count
  FROM public.reading_progress rp
  INNER JOIN public.series s ON rp.series_title = s.title
  WHERE s.creator_id = p_creator_id;
  RETURN COALESCE(reader_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.count_creator_readers(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_creator_readers(UUID) TO authenticated;

-- ── 26. Online presence column on profiles ──────────────────────────────────
-- SocialScreen selects profiles.online for the "Friends Reading" section.
-- Column doesn't exist yet; add it so the query doesn't 400. All users default
-- to false (offline) — realtime presence can update this in a future release.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT false;

-- ── 27. Friendships → Profiles named FK (data integrity) ────────────────────
-- Adds explicit named FKs from friendships to profiles(id) so ON DELETE CASCADE
-- fires correctly when a profile is removed. App uses two-step queries so these
-- are for referential integrity only. Safe to run multiple times.
DO $$ BEGIN
  ALTER TABLE friendships
    ADD CONSTRAINT friendships_requester_id_profiles_fkey
    FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  ALTER TABLE friendships
    ADD CONSTRAINT friendships_addressee_id_profiles_fkey
    FOREIGN KEY (addressee_id) REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── 28. Direct Messages ─────────────────────────────────────────────────────
-- Stores DMs and manga recommendations between friends.
-- message_type: 'text' | 'recommendation'
-- manga_data: { title, chapters, lang, description, genres, rating, searchKey }
CREATE TABLE IF NOT EXISTS direct_messages (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT,
  message_type TEXT        NOT NULL DEFAULT 'text',
  manga_data   JSONB       DEFAULT NULL,
  read_at      TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_convo_idx ON direct_messages (
  LEAST(sender_id::TEXT, recipient_id::TEXT),
  GREATEST(sender_id::TEXT, recipient_id::TEXT),
  created_at DESC
);
CREATE INDEX IF NOT EXISTS dm_recipient_unread_idx ON direct_messages (recipient_id, read_at) WHERE read_at IS NULL;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation parties read DMs"  ON direct_messages;
DROP POLICY IF EXISTS "Own DM send"                    ON direct_messages;
DROP POLICY IF EXISTS "Own DM delete"                  ON direct_messages;
CREATE POLICY "Conversation parties read DMs" ON direct_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Own DM send" ON direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Own DM delete" ON direct_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- ── 29. Chapters (creator page uploads) ─────────────────────────────────────
-- Stores per-chapter page image URLs for creator-uploaded series.
-- pages: array of public Storage URLs  e.g. ["https://...supabase.co/storage/..."]
CREATE TABLE IF NOT EXISTS chapters (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id      UUID    NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title          TEXT,
  pages          JSONB   NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS chapters_series_idx ON chapters (series_id, chapter_number);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read chapters"   ON chapters;
DROP POLICY IF EXISTS "Creator insert chapters" ON chapters;
DROP POLICY IF EXISTS "Creator delete chapters" ON chapters;
CREATE POLICY "Public read chapters" ON chapters FOR SELECT USING (true);
CREATE POLICY "Creator insert chapters" ON chapters FOR INSERT
  WITH CHECK (auth.uid() = (SELECT creator_id FROM series WHERE id = series_id));
CREATE POLICY "Creator delete chapters" ON chapters FOR DELETE
  USING (auth.uid() = (SELECT creator_id FROM series WHERE id = series_id));

-- Storage bucket for chapter page images
INSERT INTO storage.buckets (id, name, public)
  VALUES ('chapters', 'chapters', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read chapter images"  ON storage.objects;
DROP POLICY IF EXISTS "Auth upload chapter images"  ON storage.objects;
DROP POLICY IF EXISTS "Own delete chapter images"   ON storage.objects;
CREATE POLICY "Public read chapter images" ON storage.objects
  FOR SELECT USING (bucket_id = 'chapters');
CREATE POLICY "Auth upload chapter images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chapters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Own delete chapter images" ON storage.objects
  FOR DELETE USING (bucket_id = 'chapters' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 31. Badge stat RPCs ───────────────────────────────────────────────────────
-- Atomic increment helpers for badge-tracked profile columns.
-- Called from the app when reading at night or sharing a series.

CREATE OR REPLACE FUNCTION increment_night_reads(uid UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET night_reads = COALESCE(night_reads, 0) + 1 WHERE id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION increment_shares_count(uid UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = uid;
END;
$$;

-- ── 32. Direct Messages — recipient UPDATE policy (read receipts) ─────────────
-- markRead() in DMScreen does UPDATE direct_messages SET read_at = now()
-- but no UPDATE policy was defined, so RLS silently blocks it.
DROP POLICY IF EXISTS "Recipient can mark DMs read" ON direct_messages;
CREATE POLICY "Recipient can mark DMs read" ON direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- ── 33. External tracker usernames on profiles ───────────────────────────────
-- SettingsScreen lets users link their MAL and AniList profiles.
-- Previously stored only in AsyncStorage (lost on reinstall). Now persisted
-- to Supabase so they survive across devices and reinstalls.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mal_username      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anilist_username  TEXT;

-- ── 34. manga_pool — global manga catalogue for the feed engine ──────────────
-- 10K+ entries served by get_feed_batch RPC. Replaces client-side MANGA_POOL
-- JS array for feed queue refills. ForYouScreen still uses the JS array.
-- Seed data lives in supabase/seed_manga_pool.sql (run once after migrations).
CREATE TABLE IF NOT EXISTS manga_pool (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'ja',
  search_key    TEXT,
  description   TEXT,
  genres        TEXT[] NOT NULL DEFAULT '{}',
  rating        NUMERIC(3,1) DEFAULT 4.0,
  chapters      INTEGER DEFAULT 0,
  readers       TEXT,
  author        TEXT,
  updated       TEXT,
  color         TEXT DEFAULT '#0D1A2D',
  like_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  nsfw          BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS manga_pool_lang_idx   ON manga_pool (lang);
CREATE INDEX IF NOT EXISTS manga_pool_nsfw_idx   ON manga_pool (nsfw) WHERE nsfw = true;
CREATE INDEX IF NOT EXISTS manga_pool_genres_idx ON manga_pool USING GIN (genres);

ALTER TABLE manga_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read manga_pool" ON manga_pool;
CREATE POLICY "Public read manga_pool" ON manga_pool FOR SELECT USING (true);

-- ── 35. get_feed_batch RPC ────────────────────────────────────────────────────
-- Returns a randomised batch of manga_pool entries excluding already-seen IDs.
-- Genre preference scoring and lang-ratio balancing happen client-side so this
-- RPC stays fast even at 10K+ rows.
CREATE OR REPLACE FUNCTION get_feed_batch(
  p_seen_ids   TEXT[]  DEFAULT '{}',
  p_nsfw_ok    BOOLEAN DEFAULT false,
  p_batch_size INTEGER DEFAULT 80
)
RETURNS SETOF manga_pool LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT * FROM manga_pool
  WHERE (nsfw = false OR p_nsfw_ok)
    AND (cardinality(p_seen_ids) = 0 OR id != ALL(p_seen_ids))
  ORDER BY random()
  LIMIT p_batch_size;
$$;
REVOKE ALL ON FUNCTION get_feed_batch(TEXT[], BOOLEAN, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_feed_batch(TEXT[], BOOLEAN, INTEGER) TO authenticated, anon;

-- ── 36. manga_pool new columns (MangaDex pipeline) ───────────────────────────
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS cover_url      TEXT;
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS artist         TEXT;
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'ongoing';
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS content_rating TEXT DEFAULT 'safe';
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS year           INTEGER;
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS likes          INTEGER DEFAULT 0;
ALTER TABLE manga_pool ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT now();

-- ── 37. user_likes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_likes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  manga_id   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, manga_id)
);
ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own likes"  ON user_likes;
DROP POLICY IF EXISTS "Public read user_likes"  ON user_likes;
CREATE POLICY "Users manage own likes" ON user_likes USING (auth.uid() = user_id);
CREATE POLICY "Public read user_likes" ON user_likes FOR SELECT USING (true);

-- ── 38. user_genre_preferences ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_genre_preferences (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  genre      TEXT NOT NULL,
  weight     INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, genre)
);
ALTER TABLE user_genre_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own genre prefs" ON user_genre_preferences;
CREATE POLICY "Users manage own genre prefs" ON user_genre_preferences USING (auth.uid() = user_id);

-- ── 39. upsert_genre_weight RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_genre_weight(
  p_user_id UUID, p_genre TEXT, p_delta INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_genre_preferences (user_id, genre, weight)
  VALUES (p_user_id, p_genre, GREATEST(0, p_delta))
  ON CONFLICT (user_id, genre)
  DO UPDATE SET weight = GREATEST(0, user_genre_preferences.weight + p_delta);
END;
$$;
REVOKE ALL ON FUNCTION upsert_genre_weight(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION upsert_genre_weight(UUID, TEXT, INTEGER) TO authenticated;

-- ── 40. increment_manga_likes RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_manga_likes(
  p_manga_id TEXT, p_delta INTEGER
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE manga_pool SET likes = GREATEST(0, COALESCE(likes, 0) + p_delta) WHERE id = p_manga_id;
END;
$$;
REVOKE ALL ON FUNCTION increment_manga_likes(TEXT, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_manga_likes(TEXT, INTEGER) TO authenticated, anon;

-- ── 41. realtime ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE manga_pool;
ALTER PUBLICATION supabase_realtime ADD TABLE user_likes;

-- ── 42. get_personalized_feed RPC ────────────────────────────────────────────
-- Replaces get_feed_batch. Blends random cycling + trending (likes) + user genre
-- preferences. Score = random(0-100) + log(1+likes)*15 + genre_weight*5.
CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_user_id    UUID    DEFAULT NULL,
  p_seen_ids   TEXT[]  DEFAULT '{}',
  p_nsfw_ok    BOOLEAN DEFAULT false,
  p_batch_size INTEGER DEFAULT 40
)
RETURNS SETOF manga_pool
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_genre_weights JSONB;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT jsonb_object_agg(genre, weight) INTO v_genre_weights
    FROM user_genre_preferences
    WHERE user_id = p_user_id;
  END IF;

  RETURN QUERY
  SELECT mp.* FROM manga_pool mp
  WHERE (mp.nsfw = false OR p_nsfw_ok)
    AND (cardinality(p_seen_ids) = 0 OR mp.id != ALL(p_seen_ids))
  ORDER BY (
    random() * 100
    + COALESCE(log(1 + COALESCE(mp.likes, 0)::float), 0) * 15
    + CASE WHEN v_genre_weights IS NOT NULL THEN
        COALESCE((
          SELECT SUM((v_genre_weights->>g)::float)
          FROM unnest(mp.genres) AS g
          WHERE v_genre_weights ? g
        ), 0) * 5
      ELSE 0 END
  ) DESC
  LIMIT p_batch_size;
END; $$;

REVOKE ALL ON FUNCTION get_personalized_feed(UUID, TEXT[], BOOLEAN, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_personalized_feed(UUID, TEXT[], BOOLEAN, INTEGER) TO authenticated, anon;

-- ── 43. reset mock comment/like counts ───────────────────────────────────────
UPDATE manga_pool SET comment_count = 0, like_count = 0 WHERE true;

-- ── 44. Security: fix avatar storage INSERT policy to enforce path ownership ──
DROP POLICY IF EXISTS "Auth upload avatars" ON storage.objects;
CREATE POLICY "Auth upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 45. Spam prevention: one report per user per piece of content ─────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'reports' AND constraint_name = 'reports_reporter_content_unique'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_reporter_content_unique UNIQUE (reporter_id, content_id);
  END IF;
END $$;

-- ── 46. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_hours_read     ON profiles(hours_read DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_chapters_read  ON profiles(chapters_read DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_friendships_requester   ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee   ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user   ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_series         ON comments(series_title);
CREATE INDEX IF NOT EXISTS idx_notifications_user      ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender  ON direct_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recip   ON direct_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_likes_user         ON user_likes(user_id);

-- ── 47. get_suggested_friends RPC (replaces unbounded NOT IN in client) ───────
CREATE OR REPLACE FUNCTION get_suggested_friends(p_user_id UUID, p_limit INT DEFAULT 5)
RETURNS TABLE(id UUID, username TEXT, color TEXT, avatar_url TEXT, chapters_read INT, favorite_genre TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.color, p.avatar_url, p.chapters_read, p.favorite_genre
  FROM profiles p
  WHERE p.id != p_user_id
    AND p.username IS NOT NULL
    AND p.username != ''
    AND p.id NOT IN (
      SELECT CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END
      FROM friendships f
      WHERE f.requester_id = p_user_id OR f.addressee_id = p_user_id
    )
  ORDER BY p.chapters_read DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION get_suggested_friends(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_suggested_friends(UUID, INT) TO authenticated;

-- ── 48. notification_prefs column (allows cross-device pref persistence) ──────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}';

-- ── 49. Presence: online/idle/busy/offline status ─────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_activity BOOLEAN DEFAULT true;

-- ── 50. Followers (separate from friendships — one-directional, no accept step) ─
CREATE TABLE IF NOT EXISTS followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT followers_check CHECK (follower_id <> followed_id),
  UNIQUE (follower_id, followed_id)
);
CREATE INDEX IF NOT EXISTS followers_follower_idx ON followers(follower_id);
CREATE INDEX IF NOT EXISTS followers_followed_idx ON followers(followed_id);

ALTER TABLE followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "followers_select" ON followers;
CREATE POLICY "followers_select" ON followers FOR SELECT USING (true);
DROP POLICY IF EXISTS "followers_insert_own" ON followers;
CREATE POLICY "followers_insert_own" ON followers FOR INSERT WITH CHECK (follower_id = auth.uid());
DROP POLICY IF EXISTS "followers_delete_own" ON followers;
CREATE POLICY "followers_delete_own" ON followers FOR DELETE USING (follower_id = auth.uid());

-- ── 51. Blocking: blocked_users table + server-enforced DM block ──────────────
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own blocks" ON blocked_users;
CREATE POLICY "Own blocks" ON blocked_users FOR ALL USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION is_blocked_pair(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

-- RESTRICTIVE: ANDs with the existing permissive "Own DM send" policy, so a
-- blocked pair can never insert a DM regardless of any other policy.
DROP POLICY IF EXISTS "No DMs between blocked pairs" ON direct_messages;
CREATE POLICY "No DMs between blocked pairs" ON direct_messages AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT is_blocked_pair(sender_id, recipient_id));

-- ── 52. get_trending_discussions RPC — AI-ranked trending for AllDiscussionsScreen ─
CREATE OR REPLACE FUNCTION get_trending_discussions(p_user_id UUID DEFAULT NULL, p_limit INT DEFAULT 10)
RETURNS TABLE(series_title TEXT, search_key TEXT, lang TEXT, color TEXT, chapters INT, genres TEXT[], recent_count BIGINT, total_count BIGINT, score NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  top_genres TEXT[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT array_agg(genre) INTO top_genres FROM (
      SELECT genre FROM user_genre_preferences
      WHERE user_id = p_user_id ORDER BY weight DESC LIMIT 5
    ) g;
  END IF;

  RETURN QUERY
  WITH counts AS (
    SELECT
      c.series_title AS st,
      COUNT(*) FILTER (WHERE c.created_at > now() - interval '48 hours') AS recent_count,
      COUNT(*) AS total_count
    FROM comments c
    WHERE c.parent_id IS NULL
    GROUP BY c.series_title
  )
  SELECT
    co.st,
    mp.search_key,
    mp.lang,
    mp.color,
    mp.chapters,
    mp.genres,
    co.recent_count,
    co.total_count,
    (co.recent_count * 3 + co.total_count +
      CASE WHEN top_genres IS NOT NULL AND mp.genres IS NOT NULL AND mp.genres && top_genres THEN 8 ELSE 0 END
    )::numeric AS score
  FROM counts co
  LEFT JOIN manga_pool mp ON mp.title = co.st
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION get_trending_discussions(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_trending_discussions(UUID, INT) TO authenticated, anon;

-- 58. Live bookmark/share counts on manga_pool (FeedScreen always-visible counters)
ALTER TABLE public.manga_pool ADD COLUMN IF NOT EXISTS bookmark_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.manga_pool ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_manga_bookmarks(p_manga_id text, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE manga_pool SET bookmark_count = GREATEST(0, bookmark_count + p_delta) WHERE id = p_manga_id;
END; $$;

CREATE OR REPLACE FUNCTION increment_manga_shares(p_manga_id text, p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE manga_pool SET share_count = GREATEST(0, share_count + p_delta) WHERE id = p_manga_id;
END; $$;

-- 59. Live comment counts — keep manga_pool.comment_count in sync with the
-- comments table (top-level comments only, matched by series title) so the
-- feed can show real counts without a per-card COUNT(*) query.
CREATE OR REPLACE FUNCTION sync_manga_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NULL THEN
    UPDATE manga_pool SET comment_count = COALESCE(comment_count, 0) + 1 WHERE title = NEW.series_title;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NULL THEN
    UPDATE manga_pool SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1) WHERE title = OLD.series_title;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS comments_sync_pool_count ON comments;
CREATE TRIGGER comments_sync_pool_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_manga_comment_count();

-- One-time backfill so existing comments are reflected immediately
UPDATE manga_pool mp SET comment_count = sub.cnt
FROM (
  SELECT series_title, COUNT(*)::int AS cnt
  FROM comments WHERE parent_id IS NULL
  GROUP BY series_title
) sub
WHERE mp.title = sub.series_title;

-- 60. Realtime: DM read receipts (SocialScreen unread badges) and notification
-- inserts only broadcast if their tables are in the realtime publication.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- ── 36. Security hardening: server-side stats, column lockdown, rate limits ──
-- Leaderboard stats were client-written (any user could set hours_read=99999
-- with the anon key). This section makes every stat column writable ONLY via
-- capped SECURITY DEFINER RPCs, derives social counters from real rows, and
-- rate-limits comment/DM/notification inserts.
-- ═════════════════════════════════════════════════════════════════════════════

-- 36a. Badge showcase slots (pinned badge ids shown under the username)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS showcase_badges JSONB DEFAULT '[]';

-- 36b. Rate-limit infrastructure ---------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id      UUID NOT NULL,
  action       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits         INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action)
);
-- RLS with no policies: only SECURITY DEFINER functions can touch it
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION consume_rate(p_uid UUID, p_action TEXT, p_max INT, p_window INTERVAL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hits INT;
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO rate_limits (user_id, action, window_start, hits)
  VALUES (p_uid, p_action, now(), 1)
  ON CONFLICT (user_id, action) DO UPDATE SET
    hits = CASE WHEN rate_limits.window_start < now() - p_window
                THEN 1 ELSE rate_limits.hits + 1 END,
    window_start = CASE WHEN rate_limits.window_start < now() - p_window
                        THEN now() ELSE rate_limits.window_start END
  RETURNING hits INTO v_hits;
  IF v_hits > p_max THEN
    RAISE EXCEPTION 'rate limit exceeded: %', p_action USING ERRCODE = 'P0001';
  END IF;
END; $$;

-- 36c. merge_daily_log — the ONLY way to write reading time ------------------
-- Accepts { "YYYY-MM-DD": hours } from the device, clamps each day to 24h,
-- rejects future dates, keeps the per-day MAX (multi-device merge), then
-- recomputes hours_read and streak_count server-side. Cheating ceiling drops
-- from "any number" to "24h per calendar day".
CREATE OR REPLACE FUNCTION merge_daily_log(p_log JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid     UUID := auth.uid();
  merged  JSONB;
  rec     RECORD;
  v       NUMERIC;
  total   NUMERIC := 0;
  streak  INT := 0;
  day_cur DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_log IS NULL OR jsonb_typeof(p_log) <> 'object' THEN RAISE EXCEPTION 'invalid log'; END IF;

  SELECT COALESCE(daily_log, '{}'::jsonb) INTO merged FROM profiles WHERE id = uid;

  FOR rec IN SELECT key, value FROM jsonb_each(p_log) LOOP
    -- only real, non-future calendar dates
    CONTINUE WHEN rec.key !~ '^\d{4}-\d{2}-\d{2}$';
    BEGIN
      CONTINUE WHEN rec.key::date > current_date;
    EXCEPTION WHEN others THEN CONTINUE; END;
    BEGIN
      v := LEAST(GREATEST((rec.value #>> '{}')::numeric, 0), 24);
    EXCEPTION WHEN others THEN CONTINUE; END;
    -- per-day max so multi-device merges never lose hours
    IF merged ? rec.key THEN
      v := GREATEST(v, LEAST((merged ->> rec.key)::numeric, 24));
    END IF;
    merged := jsonb_set(merged, ARRAY[rec.key], to_jsonb(round(v, 3)));
  END LOOP;

  SELECT COALESCE(SUM(LEAST(val, 24)), 0) INTO total
  FROM (SELECT (value #>> '{}')::numeric AS val FROM jsonb_each(merged)) s;

  -- streak: consecutive days ending today (or yesterday if today unread)
  day_cur := current_date;
  IF NOT (merged ? day_cur::text AND (merged ->> day_cur::text)::numeric > 0) THEN
    day_cur := current_date - 1;
  END IF;
  WHILE merged ? day_cur::text AND (merged ->> day_cur::text)::numeric > 0 AND streak < 3650 LOOP
    streak := streak + 1;
    day_cur := day_cur - 1;
  END LOOP;

  UPDATE profiles
  SET daily_log = merged, hours_read = round(total, 2), streak_count = streak
  WHERE id = uid;
  RETURN merged;
END; $$;
GRANT EXECUTE ON FUNCTION merge_daily_log(JSONB) TO authenticated;

-- 36d. Hardened stat increment RPCs ------------------------------------------
-- Existing signatures kept (uid param) for older clients, but the parameter is
-- IGNORED — auth.uid() is authoritative, and every call is rate-capped.
CREATE OR REPLACE FUNCTION increment_chapters_read(uid UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(auth.uid(), 'chapters_read', 40, INTERVAL '1 hour');
  UPDATE profiles SET chapters_read = COALESCE(chapters_read, 0) + 1 WHERE id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION increment_night_reads(uid UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(auth.uid(), 'night_reads', 5, INTERVAL '24 hours');
  UPDATE profiles SET night_reads = COALESCE(night_reads, 0) + 1 WHERE id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION increment_shares_count(uid UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(auth.uid(), 'shares', 30, INTERVAL '24 hours');
  UPDATE profiles SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION increment_completed_count()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(auth.uid(), 'completed', 20, INTERVAL '24 hours');
  UPDATE profiles SET completed_count = COALESCE(completed_count, 0) + 1 WHERE id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION increment_completed_count() TO authenticated;

-- manga_count derived from real reading_progress rows — fully authoritative
CREATE OR REPLACE FUNCTION recompute_manga_count()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET manga_count = (
    SELECT COUNT(DISTINCT series_title) FROM reading_progress WHERE user_id = auth.uid()
  ) WHERE id = auth.uid();
END; $$;
GRANT EXECUTE ON FUNCTION recompute_manga_count() TO authenticated;

-- 36e. Social counters derived from real rows via triggers --------------------
CREATE OR REPLACE FUNCTION trg_bump_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles
  SET comments_count = GREATEST(COALESCE(comments_count, 0) + (CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END), 0)
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS comments_count_trg ON comments;
CREATE TRIGGER comments_count_trg
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION trg_bump_comments_count();

CREATE OR REPLACE FUNCTION trg_bump_likes_given()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles
  SET likes_given = GREATEST(COALESCE(likes_given, 0) + (CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END), 0)
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS likes_given_trg ON post_likes;
CREATE TRIGGER likes_given_trg
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION trg_bump_likes_given();

-- one-time backfill so existing users keep their counts
UPDATE profiles p SET comments_count = GREATEST(COALESCE(p.comments_count, 0),
  (SELECT COUNT(*) FROM comments c WHERE c.user_id = p.id));
UPDATE profiles p SET likes_given = GREATEST(COALESCE(p.likes_given, 0),
  (SELECT COUNT(*) FROM post_likes l WHERE l.user_id = p.id));

-- 36f. Column-level lockdown on profiles --------------------------------------
-- Direct UPDATE is limited to cosmetic/preference columns; every stat column
-- (hours_read, chapters_read, streak_count, daily_log, manga_count, night_reads,
-- shares_count, completed_count, comments_count, likes_given, friends_count,
-- ratings_count) is now writable only through the RPCs/triggers above.
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (
  username, bio, color, avatar_url, banner_url, favorites, showcase_badges,
  genre_weights, genres_count, favorite_genre,
  currently_reading, current_chapter, online, is_busy, show_activity, last_active_at,
  push_token, accepted_guidelines, guidelines_accepted_at,
  mal_username, anilist_username, notification_prefs, default_site
) ON profiles TO authenticated;

-- 36g. Rate limits on user-generated content ----------------------------------
CREATE OR REPLACE FUNCTION trg_rl_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(NEW.user_id, 'comment_post', 10, INTERVAL '1 minute');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS comments_rl_trg ON comments;
CREATE TRIGGER comments_rl_trg
  BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION trg_rl_comments();

CREATE OR REPLACE FUNCTION trg_rl_dms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM consume_rate(NEW.sender_id, 'dm_send', 25, INTERVAL '1 minute');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dms_rl_trg ON direct_messages;
CREATE TRIGGER dms_rl_trg
  BEFORE INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION trg_rl_dms();

CREATE OR REPLACE FUNCTION trg_rl_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_id IS NOT NULL THEN
    PERFORM consume_rate(NEW.actor_id, 'notif_send', 60, INTERVAL '1 minute');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notifications_rl_trg ON notifications;
CREATE TRIGGER notifications_rl_trg
  BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION trg_rl_notifications();

-- ── 37. Badge rarity: % of all readers who meet each badge requirement ───────
-- Client sends the unique (type, value) requirement pairs once per session;
-- returns { "chapters:100": 12.4, ... } with one-decimal percentages.
CREATE OR REPLACE FUNCTION badge_rarity(p_reqs JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  total  NUMERIC;
  result JSONB := '{}'::jsonb;
  rec    RECORD;
  cnt    NUMERIC;
  col    TEXT;
BEGIN
  SELECT count(*) INTO total FROM profiles;
  IF total IS NULL OR total = 0 THEN RETURN result; END IF;
  IF p_reqs IS NULL OR jsonb_typeof(p_reqs) <> 'array' OR jsonb_array_length(p_reqs) > 400 THEN
    RAISE EXCEPTION 'invalid reqs';
  END IF;

  FOR rec IN SELECT (e->>'type') AS t, (e->>'value')::numeric AS v
             FROM jsonb_array_elements(p_reqs) e LOOP
    IF rec.t = 'account' THEN
      SELECT count(*) INTO cnt FROM profiles
      WHERE created_at <= now() - make_interval(days => rec.v::int);
    ELSIF rec.t = 'profile' THEN
      SELECT count(*) INTO cnt FROM profiles WHERE avatar_url IS NOT NULL;
    ELSE
      col := CASE rec.t
        WHEN 'chapters'  THEN 'chapters_read'   WHEN 'hours'    THEN 'hours_read'
        WHEN 'streak'    THEN 'streak_count'    WHEN 'series'   THEN 'series_count'
        WHEN 'friends'   THEN 'friends_count'   WHEN 'comments' THEN 'comments_count'
        WHEN 'likes'     THEN 'likes_given'     WHEN 'completed' THEN 'completed_count'
        WHEN 'midnight'  THEN 'night_reads'     WHEN 'genres'   THEN 'genres_count'
        WHEN 'shares'    THEN 'shares_count'    WHEN 'manga'    THEN 'manga_count'
        WHEN 'ratings'   THEN 'ratings_count'   ELSE NULL END;
      IF col IS NULL THEN CONTINUE; END IF;
      EXECUTE format('SELECT count(*) FROM profiles WHERE COALESCE(%I, 0) >= $1', col)
        INTO cnt USING rec.v;
    END IF;
    result := result || jsonb_build_object(rec.t || ':' || rec.v, ROUND(cnt * 100.0 / total, 1));
  END LOOP;
  RETURN result;
END; $$;
GRANT EXECUTE ON FUNCTION badge_rarity(JSONB) TO authenticated;

-- ── 38. Drop unused friend-endorsement / profile-aura system ─────────────────
-- badge_endorsements (§30) and profile_upvotes/toggle_profile_upvote/
-- get_profile_aura (formerly §38) were both built with full server-side RPCs
-- but never got a client UI. Run this once against the live project to tear
-- down whichever of these were previously applied — safe to re-run.
DROP FUNCTION IF EXISTS get_profile_aura(UUID);
DROP FUNCTION IF EXISTS toggle_profile_upvote(UUID);
DROP TABLE IF EXISTS profile_upvotes;
DROP TABLE IF EXISTS badge_endorsements;

-- ── 39. Series ratings (1-10 points, half-star granularity) ──────────────────
-- One rating per (user, series) — re-rating overwrites in place. Feeds the
-- 'ratings' badge stat (profiles.ratings_count) and, client-side, nudges
-- genre_weights via the existing upsert_genre_weight RPC.
-- `stars` holds POINTS 1-10 (each of the 5 displayed stars is worth 2 points,
-- so half-star taps are representable) — see §40 for the 5-star-scale rescale.
CREATE TABLE IF NOT EXISTS series_ratings (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  series_title TEXT NOT NULL,
  stars        SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 10),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, series_title)
);
CREATE INDEX IF NOT EXISTS series_ratings_series_idx ON series_ratings (series_title);

ALTER TABLE series_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read ratings" ON series_ratings;
CREATE POLICY "Public read ratings" ON series_ratings FOR SELECT USING (true);
-- No direct INSERT/UPDATE policy — all writes go through rate_series() so
-- ratings_count on profiles stays in sync and can't be forged.

CREATE OR REPLACE FUNCTION rate_series(p_series_title TEXT, p_stars SMALLINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid    UUID := auth.uid();
  is_new BOOLEAN;
  v_avg  NUMERIC;
  v_count INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_series_title IS NULL OR length(trim(p_series_title)) = 0 THEN RAISE EXCEPTION 'invalid series'; END IF;
  IF p_stars < 1 OR p_stars > 10 THEN RAISE EXCEPTION 'stars must be 1-10'; END IF;
  PERFORM consume_rate(uid, 'series_rate', 30, INTERVAL '1 hour');

  INSERT INTO series_ratings (user_id, series_title, stars, updated_at)
  VALUES (uid, p_series_title, p_stars, now())
  ON CONFLICT (user_id, series_title)
  DO UPDATE SET stars = p_stars, updated_at = now()
  RETURNING (xmax = 0) INTO is_new;

  IF is_new THEN
    UPDATE profiles SET ratings_count = COALESCE(ratings_count, 0) + 1 WHERE id = uid;
  END IF;

  SELECT ROUND(AVG(stars), 2), COUNT(*) INTO v_avg, v_count
  FROM series_ratings WHERE series_title = p_series_title;

  RETURN jsonb_build_object('avg', COALESCE(v_avg, 0), 'count', COALESCE(v_count, 0), 'yourRating', p_stars);
END; $$;
REVOKE ALL ON FUNCTION rate_series(TEXT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rate_series(TEXT, SMALLINT) TO authenticated;

CREATE OR REPLACE FUNCTION get_series_rating(p_series_title TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v_avg NUMERIC; v_count INT; v_mine SMALLINT;
BEGIN
  SELECT ROUND(AVG(stars), 2), COUNT(*) INTO v_avg, v_count
  FROM series_ratings WHERE series_title = p_series_title;
  IF auth.uid() IS NOT NULL THEN
    SELECT stars INTO v_mine FROM series_ratings
    WHERE series_title = p_series_title AND user_id = auth.uid();
  END IF;
  RETURN jsonb_build_object('avg', COALESCE(v_avg, 0), 'count', COALESCE(v_count, 0), 'yourRating', v_mine);
END; $$;
GRANT EXECUTE ON FUNCTION get_series_rating(TEXT) TO authenticated, anon;

-- ── 39a. Rescale existing series_ratings from 1-5 stars to 1-10 points ───────
-- §39's table/RPCs above already reflect the new 1-10 range for fresh installs.
-- On an already-deployed project the table still has the old 1-5 CHECK and
-- old data — this doubles every stored rating (old 4★ -> 8/10) and widens the
-- constraint. Guarded on the constraint's current definition so it's a no-op
-- (safe to re-run) once it has already been applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'series_ratings'::regclass
      AND conname = 'series_ratings_stars_check'
      AND pg_get_constraintdef(oid) LIKE '%<= 5%'
  ) THEN
    ALTER TABLE series_ratings DROP CONSTRAINT series_ratings_stars_check;
    UPDATE series_ratings SET stars = stars * 2;
    ALTER TABLE series_ratings ADD CONSTRAINT series_ratings_stars_check CHECK (stars BETWEEN 1 AND 10);
  END IF;
END $$;

-- ── 40. Discord-style identity: editable display_name + immutable username ──
-- Two names per user from here on:
--   display_name — editable anytime in Settings, free-form (capitals, spaces
--                   allowed), shown as the primary name everywhere.
--   username     — set once at signup, lowercase letters/numbers only, the
--                   permanent unique @handle used for lookups/login/mentions.
-- Until now `username` served both roles with NO database-level uniqueness
-- (only a client-side "is it taken" check before signup) and Settings could
-- overwrite it with literally any string, zero validation. This section adds
-- display_name, backfills it from the existing username, normalizes any
-- non-conforming usernames that slipped through Settings, resolves any
-- resulting collisions without deleting anyone's account, then locks the
-- handle down with a real format check + unique index.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE profiles SET display_name = username WHERE display_name IS NULL AND username IS NOT NULL;

-- Normalize any usernames saved through Settings before format validation existed.
UPDATE profiles
SET username = lower(regexp_replace(username, '[^a-zA-Z0-9]', '', 'g'))
WHERE username IS NOT NULL AND username !~ '^[a-z0-9]+$';

-- Resolve collisions created by normalization (or pre-existing) by suffixing
-- later signups — never deletes a row, unlike the older one-time cleanup in
-- section 16, because this now runs against real accounts, not orphans.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY lower(username) ORDER BY created_at) AS rn
  FROM profiles WHERE username IS NOT NULL AND username != ''
)
UPDATE profiles p
SET username = p.username || (ranked.rn - 1)
FROM ranked
WHERE p.id = ranked.id AND ranked.rn > 1;

-- Anything left too short/empty after normalization can't satisfy the format
-- check below; fall back to a generated handle so the migration never fails
-- on dirty data.
UPDATE profiles
SET username = 'user' || substr(id::text, 1, 8)
WHERE username IS NULL OR length(username) < 3;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
  CHECK (username ~ '^[a-z0-9]{3,24}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique ON profiles (lower(username));

-- username moves out of the client-editable set (immutable post-signup,
-- server-enforced — not just hidden from the Settings UI); display_name
-- moves in. Also fixes a pre-existing bug: reading_vibe/reading_frequency
-- (written by OnboardingScreen's finishOnboarding) were never added to this
-- list back in section 36f — turns out those columns were never added to
-- the live table at all (the ADD COLUMN for them earlier in this file was
-- apparently never actually run), so finishOnboarding's write has been
-- silently failing outright, swallowed by its own try/catch.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reading_vibe       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reading_frequency  TEXT;
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (
  display_name, bio, color, avatar_url, banner_url, favorites, showcase_badges,
  genre_weights, genres_count, favorite_genre, reading_vibe, reading_frequency,
  currently_reading, current_chapter, online, is_busy, show_activity, last_active_at,
  push_token, accepted_guidelines, guidelines_accepted_at,
  mal_username, anilist_username, notification_prefs, default_site
) ON profiles TO authenticated;

-- One-time claim: lets a user (typically a Google sign-in, who never passed
-- through AuthScreen's registration form) set their permanent handle exactly
-- once. Rejects if they already have one — enforced atomically in the UPDATE
-- WHERE clause, not just by the client only calling this when username is
-- null, so it's race-safe and can't be replayed to rename later.
CREATE OR REPLACE FUNCTION public.claim_username(new_username TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  normalized TEXT;
  updated INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  normalized := lower(regexp_replace(new_username, '[^a-zA-Z0-9]', '', 'g'));
  IF length(normalized) < 3 OR length(normalized) > 24 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  BEGIN
    UPDATE profiles
    SET username = normalized, display_name = COALESCE(display_name, normalized)
    WHERE id = uid AND username IS NULL;
    GET DIAGNOSTICS updated = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'taken');
  END;

  IF updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_set');
  END IF;

  RETURN jsonb_build_object('ok', true, 'username', normalized);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_username(TEXT) TO authenticated;

-- ── 41. Username-or-email login ───────────────────────────────────────────────
-- supabase-js signInWithPassword only accepts an email. This resolves a
-- typed username to its account email first. Returns NULL (not an error) on
-- no match so the client shows the same generic "invalid credentials"
-- message either way — can't be used to enumerate which usernames exist.
CREATE OR REPLACE FUNCTION public.email_for_login(identifier TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  found_email TEXT;
BEGIN
  SELECT au.email INTO found_email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE lower(p.username) = lower(identifier)
  LIMIT 1;
  RETURN found_email;
END;
$$;

REVOKE ALL ON FUNCTION public.email_for_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_for_login(TEXT) TO anon, authenticated;

-- ── 42. get_suggested_friends: return display_name alongside the handle ──────
-- Return type is changing (extra column), so the old signature has to be
-- dropped before recreating — CREATE OR REPLACE can't change RETURNS TABLE.
DROP FUNCTION IF EXISTS get_suggested_friends(UUID, INT);
CREATE FUNCTION get_suggested_friends(p_user_id UUID, p_limit INT DEFAULT 5)
RETURNS TABLE(id UUID, username TEXT, display_name TEXT, color TEXT, avatar_url TEXT, chapters_read INT, favorite_genre TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.color, p.avatar_url, p.chapters_read, p.favorite_genre
  FROM profiles p
  WHERE p.id != p_user_id
    AND p.username IS NOT NULL
    AND p.username != ''
    AND p.id NOT IN (
      SELECT CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END
      FROM friendships f
      WHERE f.requester_id = p_user_id OR f.addressee_id = p_user_id
    )
  ORDER BY p.chapters_read DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION get_suggested_friends(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_suggested_friends(UUID, INT) TO authenticated;

-- ── Launch notify list (mangarecs.net "Notify me at launch" signup form) ─────
-- Public insert-only: anyone can add their email, nobody (not even other
-- signups) can read the list back over the anon/authenticated API — only via
-- the Supabase dashboard or service_role. UNIQUE(email) lets the site show
-- "you're already on the list" via the 23505 error instead of a duplicate row.
CREATE TABLE IF NOT EXISTS launch_notify (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE launch_notify ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can sign up for launch notify" ON launch_notify;
CREATE POLICY "Anyone can sign up for launch notify"
  ON launch_notify FOR INSERT
  WITH CHECK (true);

-- ── 43. Moderation queue: report metadata + admin-gated RPCs ─────────────────
-- `reports` (§9/§45) only ever had the RLS to let a reporter INSERT and the
-- service_role (edge function) SELECT — nothing let a human actually browse
-- the queue. Adds what kind of content was reported and a text snapshot of it
-- at report time (so the queue still shows something useful if the underlying
-- comment/message is edited or deleted later), plus two SECURITY DEFINER RPCs
-- gated to the single admin account (same id report-alert already hardcodes)
-- so the client can list and resolve reports without opening broader RLS.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content_snapshot TEXT;

CREATE OR REPLACE FUNCTION get_reports_queue()
RETURNS TABLE(
  id UUID, reporter_username TEXT, content_type TEXT, content_id TEXT,
  content_snapshot TEXT, reason TEXT, resolved BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  -- `!=` against NULL evaluates to NULL (not TRUE), so an unauthenticated caller
  -- (auth.uid() IS NULL) silently skipped this guard entirely. IS DISTINCT FROM
  -- treats NULL as a real value and closes that hole.
  IF auth.uid() IS DISTINCT FROM '4975b6bc-31df-4c97-ba04-8a5dfc2dc1f0'::uuid THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, p.username, r.content_type, r.content_id, r.content_snapshot, r.reason, r.resolved, r.created_at
  FROM reports r
  LEFT JOIN profiles p ON p.id = r.reporter_id
  ORDER BY r.resolved ASC, r.created_at DESC
  LIMIT 200;
END; $$;
REVOKE ALL ON FUNCTION get_reports_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_reports_queue() TO authenticated;

CREATE OR REPLACE FUNCTION resolve_report(p_report_id UUID, p_resolved BOOLEAN DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Same NULL-safety fix as get_reports_queue() above.
  IF auth.uid() IS DISTINCT FROM '4975b6bc-31df-4c97-ba04-8a5dfc2dc1f0'::uuid THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE reports SET resolved = p_resolved WHERE id = p_report_id;
END; $$;
REVOKE ALL ON FUNCTION resolve_report(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_report(UUID, BOOLEAN) TO authenticated;

-- ── 44. Baseline social-proof counts + likes/like_count column reconciliation ─
-- §36 added `likes` alongside the original `like_count`, but every live path
-- (increment_manga_likes, get_personalized_feed's scoring, realtime updates)
-- only ever touched `likes` — `like_count` was a dead column frozen at 0 since
-- §43's reset, while the app's initial feed fetch read *that* dead column.
-- The client fix (FeedScreen.js) now reads `likes`; this backfills it so a
-- once-legitimate `like_count` value isn't lost, and is a no-op going forward.
UPDATE manga_pool SET likes = GREATEST(likes, like_count) WHERE like_count > likes;

-- Every count is 0 for a brand-new account base, which reads as "nobody uses
-- this app" to a new visitor. Seed likes/bookmarks/shares with numbers scaled
-- by each title's own popularity (its `readers` figure, e.g. "12.3M"), as if
-- roughly 100 early users had already engaged proportionally to how popular
-- the series actually is — comments are deliberately left untouched (real
-- discussion counts, not a number that's fine to fake). Only raises a count
-- that's currently below its computed baseline, so any already-live/organic
-- number (from real likes/bookmarks/shares since launch) is never lowered.
CREATE OR REPLACE FUNCTION _parse_reader_count(txt TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN txt IS NULL OR txt = '' THEN 0
    WHEN txt ~* '[0-9.]+\s*M' THEN (regexp_replace(txt, '[^0-9.]', '', 'g'))::numeric * 1000000
    WHEN txt ~* '[0-9.]+\s*K' THEN (regexp_replace(txt, '[^0-9.]', '', 'g'))::numeric * 1000
    ELSE COALESCE(NULLIF(regexp_replace(txt, '[^0-9.]', '', 'g'), '')::numeric, 0)
  END;
$$;

DO $$
DECLARE
  r RECORD;
  pct NUMERIC;
BEGIN
  FOR r IN
    SELECT id, likes, bookmark_count, share_count,
           PERCENT_RANK() OVER (ORDER BY _parse_reader_count(readers)) AS p
    FROM manga_pool
  LOOP
    pct := r.p;
    UPDATE manga_pool SET
      likes          = GREATEST(likes,          (5  + pct * 90 + (random() * 10 - 5))::int),
      bookmark_count = GREATEST(bookmark_count,  (3  + pct * 55 + (random() * 8  - 4))::int),
      share_count    = GREATEST(share_count,     (1  + pct * 30 + (random() * 6  - 3))::int)
    WHERE id = r.id;
  END LOOP;
END $$;
