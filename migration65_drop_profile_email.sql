-- Migration 65 — remove harvestable email addresses from `profiles`.
-- Run in the Supabase SQL editor. Run migration 62 phase B first (or after —
-- they are independent), but do not ship a public launch without both.
--
-- ── The problem ──────────────────────────────────────────────────────────
-- `profiles` carries an `email` column, populated for every user by the
-- handle_new_user() trigger, and its SELECT policy is:
--
--     "Public profiles are viewable by everyone"  USING (true)
--
-- The anon key that satisfies that policy is compiled into the shipped app
-- bundle and is trivially extractable, so anyone can enumerate every user's
-- email address with a single unauthenticated request. Verified 2026-08-08:
-- 6 of 6 profiles had an email stored.
--
-- This is the same class of exposure migration 62 fixed for push_token, and
-- it was missed because push_token was the only column that audit looked at.
--
-- ── Why dropping is safe ─────────────────────────────────────────────────
-- Nothing reads `profiles.email`. Verified across the whole repository: no
-- screen, no util, and none of the four Edge Functions reference it. The
-- system of record is `auth.users.email`, which is not world-readable and
-- which the owning user can always reach via supabase.auth.getUser().
--
-- The trigger below keeps reading NEW.email — that is auth.users.email, used
-- only to derive a default username — it just stops copying it into the
-- public table.

BEGIN;

-- Stop writing it first, so no signup can race the DROP and fail.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

COMMIT;

-- Verify afterwards — expect 0:
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='profiles' and column_name='email';

-- APPLIED 2026-08-10 via the Management API. Verified after: the email column
-- is gone (0 rows in information_schema), an anon read of profiles.email now
-- returns 42703, and profiles remains readable for everything else.
-- Before running, the exposure was confirmed live: 6 of 6 profiles returned an
-- email address to an unauthenticated request using the shipped anon key.
