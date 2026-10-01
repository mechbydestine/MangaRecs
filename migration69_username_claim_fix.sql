-- Migration 69 — make signup survive, and make the username a user picks stick.
-- Run in the Supabase SQL editor (or via the Management API).
--
-- Migrations 62/65/66/67/68 are all applied. This is the first new one since
-- 2026-08-23, and it fixes a chain of three defects that all meet at
-- handle_new_user(). Found while auditing why `claim_username` never succeeds.
--
-- ── Defect 1: OAuth signup can abort outright ────────────────────────────
-- migration 65's handle_new_user() inserts:
--
--     COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1))
--
-- straight into profiles.username, but section 40 of supabase_migrations.sql
-- put two hard guarantees on that column:
--
--     CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9]{3,24}$')
--     UNIQUE INDEX profiles_username_lower_unique ON profiles (lower(username))
--
-- The registration form satisfies the CHECK by accident of the client:
-- handleUsernameChange() strips to [a-zA-Z0-9] and lowercases, and the field
-- carries maxLength={24}. The *fallback* arm satisfies neither. A Google
-- sign-in (or anything else that arrives without a `username` in the signup
-- metadata) seeds from the raw email local-part, so `d.kene+manga@gmail.com`
-- yields `d.kene+manga`, which fails the CHECK. A raise inside an AFTER INSERT
-- trigger on auth.users aborts the auth.users insert too, so the account is
-- never created and the client gets an opaque "Database error saving new user".
--
-- Both arms are exposed to the unique index: `ON CONFLICT (id) DO NOTHING`
-- catches only the primary key, not profiles_username_lower_unique, and the
-- form's availability check is a debounced best-effort read, so two people
-- claiming one handle (or two email local-parts that match across domains)
-- is an unhandled unique_violation and, again, a failed signup.
--
-- ── Defect 2: claim_username() can never succeed ─────────────────────────
-- Because the trigger always seeds *something*, username is never NULL by the
-- time onboarding runs, so this guard matches zero rows, every time:
--
--     WHERE id = uid AND username IS NULL
--
-- It returns ok:false / 'already_set' and the handle the onboarding screen
-- just called permanent is discarded. The one-time-claim intent was right; the
-- sentinel was wrong. Replaced with an explicit `username_claimed` flag, which
-- keeps the atomic single-claim guarantee without depending on NULL.
--
-- ── Defect 3: the client's fallback cannot work by design ────────────────
-- v1.5.2 added a direct `profiles.update({ username })` fallback in
-- OnboardingScreen on the belief that the owner holds a column grant for it.
-- They do not, deliberately: migration 62 phase B revoked `username` from the
-- column-level UPDATE set precisely so a client cannot bypass this function's
-- validation, and that grant was verified live on 2026-08-10. The fallback can
-- only ever return 42501, so the net effect of 1.5.2 was to turn a silent
-- discard into a visible "couldn't save your username" toast on every signup.
-- Fixed on the client side instead; the grant below is unchanged and correct.
--
-- ── Defect 4: email registration fails on the same grant ─────────────────
-- Same root cause, worse symptom, and the reason this is a P0 rather than a
-- papercut. AuthScreen.js:190 follows signUp() with an upsert of `username`
-- plus the whole stat block (streak_count, chapters_read, hours_read,
-- night_reads, genres_count, shares_count, manga_count, ratings_count) and
-- `created_at`. handle_new_user() has already created that row, so the upsert
-- always takes the ON CONFLICT DO UPDATE path, which needs column UPDATE on
-- every one of those - and section 36f revoked the stat columns on purpose
-- ("writable only through the RPCs/triggers above") exactly so a client could
-- not set hours_read=99999. So it returns 42501, and AuthScreen treats that as
-- fatal (setError + return) for an account the auth server had in fact just
-- created successfully. The user sees a permission error, retries, and is told
-- the email is already registered. Every stat column carries a DEFAULT and the
-- trigger supplies the rest, so the upsert was never load-bearing; it is
-- removed on the client rather than papered over by widening the grant.
--
-- Nothing here is destructive and every step is idempotent.

BEGIN;

-- ── 1. An explicit claim flag, so the guard stops depending on NULL ──────
-- Added as DEFAULT true so the ADD COLUMN itself backfills every existing row:
-- those accounts keep the handle they are already known by, and nobody's
-- username becomes re-claimable retroactively. The default then flips to false
-- so only new signups get an open claim.
--
-- Deliberately not `DEFAULT false` plus an UPDATE backfill: that pair is not
-- idempotent. Re-running this file later would re-mark as claimed any user
-- sitting between signup and onboarding, silently taking away the claim they
-- had not used yet. These two statements can be re-run any number of times.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_claimed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles
  ALTER COLUMN username_claimed SET DEFAULT false;

-- ── 2. A username generator that cannot violate either guarantee ─────────
-- Returns a value that always satisfies profiles_username_format and is free
-- against profiles_username_lower_unique at the moment it is called.
CREATE OR REPLACE FUNCTION public.derive_unique_username(seed TEXT, for_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base      TEXT;
  candidate TEXT;
  n         INT := 0;
BEGIN
  base := lower(regexp_replace(COALESCE(seed, ''), '[^a-zA-Z0-9]', '', 'g'));
  -- Too short to be legal (or nothing survived stripping): fall back to the id.
  IF length(base) < 3 THEN
    base := 'user' || substr(replace(COALESCE(for_id, gen_random_uuid())::text, '-', ''), 1, 8);
  END IF;
  base := substr(base, 1, 24);

  candidate := base;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE lower(username) = candidate) LOOP
    n := n + 1;
    IF n > 999 THEN
      -- Pathological contention: stop guessing and use something unique.
      candidate := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      EXIT;
    END IF;
    candidate := substr(base, 1, 24 - length(n::text)) || n::text;
  END LOOP;

  RETURN candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.derive_unique_username(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ── 3. A trigger that seeds a legal username and never aborts signup ─────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  asked    TEXT := NULLIF(NEW.raw_user_meta_data->>'username', '');
  seed     TEXT := COALESCE(asked, split_part(COALESCE(NEW.email, ''), '@', 1));
  final    TEXT;
  wanted   TEXT;
BEGIN
  final  := public.derive_unique_username(seed, NEW.id);
  wanted := lower(regexp_replace(COALESCE(asked, ''), '[^a-zA-Z0-9]', '', 'g'));

  INSERT INTO public.profiles (id, username, display_name, username_claimed)
  VALUES (
    NEW.id,
    final,
    COALESCE(asked, final),
    -- Only treat the handle as already claimed when the user explicitly asked
    -- for it AND got exactly it. If a collision forced a numeric suffix, leave
    -- the claim open so onboarding can let them pick again.
    wanted <> '' AND wanted = final
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Seeding a profile must never be the reason an account cannot be created.
  -- Worst case the user gets an id-derived handle and claims a real one in
  -- onboarding, which is the whole point of username_claimed staying false.
  BEGIN
    INSERT INTO public.profiles (id, username, username_claimed)
    VALUES (NEW.id, 'user' || substr(replace(NEW.id::text, '-', ''), 1, 12), false)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- The trigger itself predates this file and is not in supabase_migrations.sql,
-- so its name is not known from the repo. CREATE OR REPLACE above already
-- changes the behaviour of whatever trigger is attached, whatever it is called,
-- so this block only covers the case where none is attached at all - and it
-- matches on the function, not on a guessed name, so it cannot end up adding a
-- second trigger alongside an existing one.
--
-- Guarded: auth.users is owned by supabase_auth_admin, and a privilege error
-- here must not roll back the four fixes above, which are the point of the file.
DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
     WHERE tg.tgrelid = 'auth.users'::regclass
       AND NOT tg.tgisinternal
       AND tg.tgfoid = 'public.handle_new_user()'::regprocedure
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users '
         || 'FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
    RAISE NOTICE 'migration69: created missing trigger on_auth_user_created';
  ELSE
    RAISE NOTICE 'migration69: handle_new_user trigger already attached, left alone';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'migration69: skipped trigger assertion (no privilege on auth.users)';
END
$outer$;

-- ── 4. A one-time claim that actually fires ──────────────────────────────
-- Still exactly once, still race-safe (the gate is in the UPDATE's WHERE, not
-- in a prior SELECT), and now idempotent: asking for the handle you already
-- hold is a success rather than 'already_set', so a retry after a dropped
-- response does not surface a false error.
CREATE OR REPLACE FUNCTION public.claim_username(new_username TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid        UUID := auth.uid();
  normalized TEXT;
  current_name TEXT;
  claimed    BOOLEAN;
  updated    INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  normalized := lower(regexp_replace(COALESCE(new_username, ''), '[^a-zA-Z0-9]', '', 'g'));
  IF length(normalized) < 3 OR length(normalized) > 24 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT username, COALESCE(username_claimed, false)
    INTO current_name, claimed
    FROM profiles WHERE id = uid;

  -- Already yours: report success and settle the flag.
  IF current_name IS NOT NULL AND lower(current_name) = normalized THEN
    UPDATE profiles SET username_claimed = true WHERE id = uid;
    RETURN jsonb_build_object('ok', true, 'username', normalized);
  END IF;

  IF claimed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_set');
  END IF;

  BEGIN
    UPDATE profiles
       SET username         = normalized,
           display_name     = COALESCE(display_name, normalized),
           username_claimed = true
     WHERE id = uid
       AND COALESCE(username_claimed, false) = false;
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

-- ── 5. Re-assert the authoritative column grant ──────────────────────────
-- supabase_migrations.sql section 62 still carries the stale list that migration
-- 62 phase B was corrected away from: it names `username` (which must stay out)
-- and omits `display_name`, `reading_vibe` and `reading_frequency` (which must
-- stay in). Anyone replaying the consolidated file would silently break the
-- Settings display-name editor and onboarding's reading_vibe write. Re-issuing
-- the correct 23 here makes the newest migration the one that wins.
-- This GRANT replaces the whole set; it does not merge. Add new user-writable
-- columns here.
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (
  accepted_guidelines,
  anilist_username,
  avatar_url,
  banner_url,
  bio,
  color,
  current_chapter,
  currently_reading,
  default_site,
  display_name,
  favorite_genre,
  favorites,
  genre_weights,
  genres_count,
  guidelines_accepted_at,
  is_busy,
  last_active_at,
  mal_username,
  online,
  reading_frequency,
  reading_vibe,
  show_activity,
  showcase_badges
) ON profiles TO authenticated;

COMMIT;

-- ── Verify afterwards ────────────────────────────────────────────────────
-- Expect username_claimed to exist and be true for every pre-existing row:
--   select count(*) filter (where username_claimed) as claimed, count(*) as total
--     from profiles;
--
-- Expect every stored username to satisfy the format constraint:
--   select count(*) from profiles where username !~ '^[a-z0-9]{3,24}$';
--
-- Expect `authenticated` to hold exactly the 23 columns above, with
-- display_name present and username absent:
--   select a.attname
--     from pg_attribute a cross join lateral aclexplode(a.attacl) x
--    where a.attrelid = 'public.profiles'::regclass
--      and x.grantee = 'authenticated'::regrole
--      and x.privilege_type = 'UPDATE'
--    order by 1;
--
-- Expect the trigger to be present and pointing at the new body:
--   select tgname from pg_trigger
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- NOT YET APPLIED. The access token supplied on 2026-10-01 returned 401 on
-- /v1/projects and /v1/organizations, so this has never touched the live
-- database. Stamp this footer once it has.
