-- Migration 66 — storage bucket limits. Run in the Supabase SQL editor.
--
-- Audited 2026-08-08. All four buckets were public with `file_size_limit`
-- NULL and `allowed_mime_types` NULL, i.e. any signed-in user could upload a
-- file of any size and any type, forever, to a publicly served URL. That is
-- free unmetered file hosting attached to your storage bill, and an HTML or
-- SVG upload served from your own domain is a stored-XSS vector.
--
-- Every client upload path is images only:
--   avatars   — uploadMediaFile() in utils/ProfileContext.js
--   dm-media  — DMScreen.js:853, via the same helper
--   chapters  — CreatorDashboardScreen.js:240, creator page uploads
-- uploadMediaFile only ever sends image/jpeg, image/png or image/gif, so the
-- allowlist below cannot reject anything the app legitimately sends.
--
-- `sounds` is deliberately left alone: nothing in the client writes to it
-- (the ambience tracks are bundled via require()), so its contents are
-- operator-managed and an allowlist here would only get in your way.

BEGIN;

UPDATE storage.buckets
   SET file_size_limit    = 5242880,   -- 5 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id = 'avatars';

UPDATE storage.buckets
   SET file_size_limit    = 10485760,  -- 10 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id = 'dm-media';

UPDATE storage.buckets
   SET file_size_limit    = 15728640,  -- 15 MB, manga pages run large
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp']
 WHERE id = 'chapters';

COMMIT;

-- Verify:
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets order by id;

-- ─────────────────────────────────────────────────────────────────────────
-- NOT DONE HERE, and it needs a decision: `dm-media` is a PUBLIC bucket.
--
-- Direct-message images are served from an unauthenticated public URL. The
-- path is `{senderId}/{Date.now()}-{Math.random().toString(36).slice(2)}`,
-- which is obscure but not secret — and once a URL leaks (a forward, a proxy
-- log, a CDN cache, a screenshot) it grants permanent access with no way to
-- revoke it. For a private messaging feature that is the wrong default.
--
-- The fix is three coordinated changes, which is why it is not bundled here:
--   1. UPDATE storage.buckets SET public = false WHERE id = 'dm-media';
--   2. A storage.objects SELECT policy limiting reads to the two parties of
--      the conversation the object belongs to.
--   3. utils/ProfileContext.js uploadMediaFile() returning a signed URL
--      (createSignedUrl) instead of getPublicUrl() for this bucket, and
--      DMScreen re-signing on render.
--
-- Step 3 is the risky one: signed URLs expire, and expo-image caches by URL,
-- so an expiry shorter than a scroll-back through history shows broken
-- images. That needs testing on a real device against a real thread, which
-- is why I have flagged it rather than shipped it blind.
-- ─────────────────────────────────────────────────────────────────────────

-- APPLIED 2026-08-10 via the Management API. Verified before: all four buckets
-- were public with file_size_limit NULL and allowed_mime_types NULL. Verified
-- after: avatars 5 MB, dm-media 10 MB, chapters 15 MB, each restricted to
-- jpeg/png/gif/webp. `sounds` deliberately untouched.
