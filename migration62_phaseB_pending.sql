-- Migration 62, destructive half. Run in the Supabase SQL editor.
-- Prereqs (all DONE as of 2026-07-30): user_push_settings created + backfilled,
-- all four Edge Functions deployed, client OTA published to `preview`.
--
-- Verified against the live database on 2026-08-08 before running:
--   6 profiles, 6 user_push_settings rows, 0 tokens and 0 prefs unmigrated.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CORRECTION (2026-08-08): the GRANT below is NOT the one this file
-- originally carried. That list had gone stale against the schema and would
-- have caused a silent production breakage:
--
--   * It omitted `display_name`, `reading_vibe` and `reading_frequency`,
--     all of which are currently granted. SettingsScreen writes display_name
--     (updateProfile({ display_name })) and OnboardingScreen writes
--     reading_vibe — both would have started failing with permission denied,
--     with no error surfaced to the user.
--
--   * It added `username`, which is deliberately NOT directly updatable:
--     username changes go through the claim_username(text) RPC, and granting
--     column UPDATE would let a client bypass that function's validation.
--
-- The list is now exactly the live grant set minus the two dropped columns,
-- so this migration changes nothing except removing push_token and
-- notification_prefs. If you add a user-writable column later, add it here
-- too — this GRANT replaces the whole set, it does not merge.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE profiles DROP COLUMN IF EXISTS push_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS notification_prefs;

-- Section 36f's UPDATE grant named both dropped columns; re-issue without them.
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
