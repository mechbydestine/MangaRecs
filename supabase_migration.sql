-- ============================================================
-- MangaRecs — Full Supabase Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- All statements are idempotent (safe to re-run)
-- ============================================================

-- ── 1. profiles ─────────────────────────────────────────────
-- Core table is auto-created by Supabase Auth; add app columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio              TEXT,
  ADD COLUMN IF NOT EXISTS color            TEXT DEFAULT '#534AB7',
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT,
  ADD COLUMN IF NOT EXISTS banner_url       TEXT,
  ADD COLUMN IF NOT EXISTS hours_read       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chapters_read    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_genre   TEXT,
  ADD COLUMN IF NOT EXISTS currently_reading TEXT,
  ADD COLUMN IF NOT EXISTS current_chapter  INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS push_token       TEXT,
  ADD COLUMN IF NOT EXISTS genre_weights    JSONB   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_site     JSONB   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_log        JSONB   DEFAULT '{}';

-- Ensure the basic columns exist (in case profiles table was freshly created)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username  TEXT,
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- ── 2. Auto-create profile on signup ────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ── 3. friendships ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.friendships (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friendships;
CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;
CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Addressee can respond to requests" ON public.friendships;
CREATE POLICY "Addressee can respond to requests"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Users can remove friendships" ON public.friendships;
CREATE POLICY "Users can remove friendships"
  ON public.friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ── 4. comments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comments (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title  TEXT        NOT NULL,
  text          TEXT        NOT NULL,
  likes         INTEGER     DEFAULT 0,
  spoiler       BOOLEAN     DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_series_title_idx ON public.comments (series_title);
CREATE INDEX IF NOT EXISTS comments_user_id_idx      ON public.comments (user_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments are publicly readable" ON public.comments;
CREATE POLICY "Comments are publicly readable"
  ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can comment" ON public.comments;
CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);


-- ── 5. post_likes ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.post_likes (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title  TEXT  NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, series_title)
);

CREATE INDEX IF NOT EXISTS post_likes_user_id_idx ON public.post_likes (user_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own likes" ON public.post_likes;
CREATE POLICY "Users can view their own likes"
  ON public.post_likes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;
CREATE POLICY "Users can like posts"
  ON public.post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike posts" ON public.post_likes;
CREATE POLICY "Users can unlike posts"
  ON public.post_likes FOR DELETE
  USING (auth.uid() = user_id);


-- ── 6. reading_progress ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reading_progress (
  user_id         UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_title    TEXT  NOT NULL,
  current_chapter INTEGER     DEFAULT 1,
  total_chapters  INTEGER,
  status          TEXT  NOT NULL DEFAULT 'reading'
                        CHECK (status IN ('reading', 'completed', 'on_hold', 'dropped', 'bookmarked')),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, series_title)
);

CREATE INDEX IF NOT EXISTS reading_progress_user_id_idx ON public.reading_progress (user_id);
CREATE INDEX IF NOT EXISTS reading_progress_updated_at_idx ON public.reading_progress (updated_at);

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own reading progress" ON public.reading_progress;
CREATE POLICY "Users can manage own reading progress"
  ON public.reading_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 7. series ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.series (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  genre       TEXT,
  status      TEXT        DEFAULT 'ongoing'
              CHECK (status IN ('ongoing', 'hiatus', 'completed')),
  chapters    INTEGER     DEFAULT 0,
  views       INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS series_creator_id_idx ON public.series (creator_id);

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Series are publicly viewable" ON public.series;
CREATE POLICY "Series are publicly viewable"
  ON public.series FOR SELECT USING (true);

DROP POLICY IF EXISTS "Creators can manage own series" ON public.series;
CREATE POLICY "Creators can manage own series"
  ON public.series FOR ALL
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);


-- ── 8. notifications ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  data        JSONB       DEFAULT '{}',
  read        BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
CREATE POLICY "Users can manage own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 9. Storage — avatars bucket ──────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ── 10. delete_user RPC ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;


-- ── 11. increment_chapters_read RPC ─────────────────────────
-- Atomically increments chapters_read for the calling user.

CREATE OR REPLACE FUNCTION public.increment_chapters_read(uid UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles
  SET chapters_read = COALESCE(chapters_read, 0) + 1
  WHERE id = uid;
$$;

REVOKE ALL ON FUNCTION public.increment_chapters_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_chapters_read(UUID) TO authenticated;


-- ── 12. Badge stat columns on profiles ───────────────────────
-- Required by the badge engine (computeEarnedBadgeIds / profileToBadgeStats).
-- All default to 0; safe to run on an existing table.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS completed_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS series_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friends_count    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_given      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_reads      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genres_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manga_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratings_count    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_days     INTEGER DEFAULT 0;


-- ── 13. Friendships: auto-sync friends_count ─────────────────
-- Keeps profiles.friends_count accurate without manual updates.

CREATE OR REPLACE FUNCTION public.sync_friends_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Recount accepted friendships for both sides of the changed row
  UPDATE public.profiles
  SET friends_count = (
    SELECT COUNT(*) FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = profiles.id OR addressee_id = profiles.id)
  )
  WHERE id IN (
    COALESCE(NEW.requester_id, OLD.requester_id),
    COALESCE(NEW.addressee_id, OLD.addressee_id)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_friends_count ON public.friendships;
CREATE TRIGGER trg_sync_friends_count
  AFTER INSERT OR UPDATE OR DELETE ON public.friendships
  FOR EACH ROW EXECUTE PROCEDURE public.sync_friends_count();


-- ── 14. account_days: computed on profile fetch ───────────────
-- A view-level helper so account_days stays current without cron jobs.
-- The app can also just compute it client-side from created_at, but this
-- RPC lets you call it from SQL if needed.

CREATE OR REPLACE FUNCTION public.get_account_days(uid UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  FROM public.profiles WHERE id = uid;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_days(UUID) TO authenticated;


-- ── 15. Fix FK so notification actor names resolve correctly ─────────────────
-- notifications.actor_id referenced auth.users, which has no username column.
-- PostgREST couldn't resolve actor:actor_id(username), so all notifications
-- showed "Someone" instead of the real username. Point FK to profiles instead.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 16. Fix comments schema to match app column names ───────────────────────

ALTER TABLE public.comments RENAME COLUMN content TO text;
ALTER TABLE public.comments RENAME COLUMN is_spoiler TO spoiler;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own comment likes" ON public.comment_likes;
CREATE POLICY "Users can manage own comment likes"
  ON public.comment_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = p_comment_id AND user_id = auth.uid()) THEN
    DELETE FROM comment_likes WHERE comment_id = p_comment_id AND user_id = auth.uid();
    UPDATE comments SET likes = GREATEST(0, COALESCE(likes, 0) - 1) WHERE id = p_comment_id;
  ELSE
    INSERT INTO comment_likes (comment_id, user_id) VALUES (p_comment_id, auth.uid());
    UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = p_comment_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_comment_like(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(UUID) TO authenticated;

-- ── 17. One-time cleanup + cascade on profiles ───────────────────────────────

DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;


-- ── 18. Creator Dashboard — views tracking & unique reader count ─────────────
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

-- ── 19. Online presence column on profiles ──────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT false;

-- ── 20. Friendships → Profiles FK for PostgREST embed queries ───────────────
-- The original friendships table references auth.users(id), but PostgREST cannot
-- follow that FK to embed profiles columns (different schema). Adding named FKs
-- to profiles(id) lets the friend embed queries return actual profile data.
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

-- ── 21. Direct Messages ─────────────────────────────────────────────────────
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

-- ── 22. Chapters (creator page uploads) ─────────────────────────────────────
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
DROP POLICY IF EXISTS "Public read chapters"    ON chapters;
DROP POLICY IF EXISTS "Creator insert chapters" ON chapters;
DROP POLICY IF EXISTS "Creator delete chapters" ON chapters;
CREATE POLICY "Public read chapters" ON chapters FOR SELECT USING (true);
CREATE POLICY "Creator insert chapters" ON chapters FOR INSERT
  WITH CHECK (auth.uid() = (SELECT creator_id FROM series WHERE id = series_id));
CREATE POLICY "Creator delete chapters" ON chapters FOR DELETE
  USING (auth.uid() = (SELECT creator_id FROM series WHERE id = series_id));

INSERT INTO storage.buckets (id, name, public)
  VALUES ('chapters', 'chapters', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read chapter images" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload chapter images" ON storage.objects;
DROP POLICY IF EXISTS "Own delete chapter images"  ON storage.objects;
CREATE POLICY "Public read chapter images" ON storage.objects
  FOR SELECT USING (bucket_id = 'chapters');
CREATE POLICY "Auth upload chapter images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chapters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Own delete chapter images" ON storage.objects
  FOR DELETE USING (bucket_id = 'chapters' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 23. Badge Endorsements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS badge_endorsements (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endorser_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endorser_id, recipient_id, badge_id)
);
CREATE INDEX IF NOT EXISTS badge_endorsements_recipient_idx ON badge_endorsements (recipient_id, badge_id);

ALTER TABLE badge_endorsements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read endorsements" ON badge_endorsements;
DROP POLICY IF EXISTS "Own endorse"              ON badge_endorsements;
DROP POLICY IF EXISTS "Own un-endorse"           ON badge_endorsements;
CREATE POLICY "Public read endorsements" ON badge_endorsements FOR SELECT USING (true);
CREATE POLICY "Own endorse"    ON badge_endorsements FOR INSERT WITH CHECK (auth.uid() = endorser_id);
CREATE POLICY "Own un-endorse" ON badge_endorsements FOR DELETE USING  (auth.uid() = endorser_id);
