-- Migration 62, destructive half. Run in the Supabase SQL editor.
-- Prereqs (all DONE as of 2026-07-30): user_push_settings created + backfilled,
-- all four Edge Functions deployed, client OTA published to `preview`.
ALTER TABLE profiles DROP COLUMN IF EXISTS push_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS notification_prefs;

-- Section 36f's UPDATE grant named both dropped columns; re-issue without them.
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (
  username, bio, color, avatar_url, banner_url, favorites, showcase_badges,
  genre_weights, genres_count, favorite_genre,
  currently_reading, current_chapter, online, is_busy, show_activity, last_active_at,
  accepted_guidelines, guidelines_accepted_at,
  mal_username, anilist_username, default_site
) ON profiles TO authenticated;
