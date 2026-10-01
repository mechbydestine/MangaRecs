-- Migration 70 — schedule the reading-streak reminder push.
-- Finishes section 56 of supabase_migrations.sql, which has sat commented out
-- since it was written because it needed a secret pasted into it.
--
-- ── Run this ONLY after the function exists ──────────────────────────────
--     supabase functions deploy streak-reminder
--
-- The code is complete (supabase/functions/streak-reminder/index.ts) but has
-- never been deployed. Scheduling first would just produce one failing
-- net.http_post per day, logged nowhere the app would notice, which is worse
-- than not scheduling at all. Verify first:
--     supabase functions list
--
-- ── Why the key is not in this file ──────────────────────────────────────
-- Section 56's draft embedded the service role key directly in the cron body:
--
--     'Authorization', 'Bearer SERVICE_ROLE_KEY'
--
-- That key bypasses RLS completely, and the file it would have been pasted into
-- is tracked in git. It also lands in cron.job.command in plaintext, readable by
-- anything that can select from cron.job. So it goes in Vault instead and the
-- cron body dereferences it at call time. Run this once, by hand, and it never
-- touches the repo:
--
--     select vault.create_secret(
--       '<the service_role key from Settings -> API>',
--       'service_role_key',
--       'Used by the streak-reminder cron to call its own Edge Function'
--     );
--
-- To rotate later: select vault.update_secret(
--   (select id from vault.secrets where name = 'service_role_key'), '<new key>');
-- The schedule needs no change, because it reads the secret by name.

BEGIN;

-- ── 1. Prerequisites, checked rather than assumed ────────────────────────
DO $guard$
DECLARE
  missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    missing := missing || ' pg_cron';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    missing := missing || ' pg_net';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION
      'migration70: missing extension(s):%. Enable them under Database -> Extensions first.', missing;
  END IF;

  -- chapter-push already runs on a schedule, so both are expected to be here;
  -- this exists so a missing one fails loudly now instead of silently never
  -- firing, which is how section 56 went unnoticed for two months.
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    RAISE EXCEPTION
      'migration70: no Vault secret named service_role_key. Create it first (see the header).';
  END IF;
END
$guard$;

-- ── 2. Replace any previous schedule, so this file is re-runnable ────────
DO $unschedule$
BEGIN
  PERFORM cron.unschedule('streak-reminder-daily');
  RAISE NOTICE 'migration70: replaced an existing streak-reminder-daily schedule';
EXCEPTION WHEN OTHERS THEN
  -- cron.unschedule raises if the job does not exist; that is the normal path.
  NULL;
END
$unschedule$;

-- ── 3. Schedule it ──────────────────────────────────────────────────────
-- 23:00 UTC = 7pm ET / 4pm PT, i.e. evening for the US-majority userbase this
-- app currently has. The function itself is idempotent per user per calendar
-- day (profiles.last_streak_reminder_sent, section 56), so an extra invocation
-- cannot double-send; the hour is a reach decision, not a correctness one.
SELECT cron.schedule(
  'streak-reminder-daily',
  '0 23 * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://jlzsnmwyyjefjekscvgs.supabase.co/functions/v1/streak-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      ),
      'Content-Type', 'application/json'
    )
  );
  $job$
);

COMMIT;

-- ── Verify afterwards ────────────────────────────────────────────────────
-- The job exists, is active, and carries no literal key:
--   select jobname, schedule, active, command like '%decrypted_secrets%' as uses_vault
--     from cron.job where jobname = 'streak-reminder-daily';
--
-- After the first 23:00 UTC tick, confirm it actually ran and what it returned:
--   select j.jobname, r.status, r.return_message, r.start_time
--     from cron.job_run_details r join cron.job j on j.jobid = r.jobid
--    where j.jobname = 'streak-reminder-daily'
--    order by r.start_time desc limit 5;
--
-- And that it reached real users rather than no-oping:
--   select count(*) from profiles where last_streak_reminder_sent = current_date;
--
-- ── Still outstanding after this ─────────────────────────────────────────
-- The reminder has no dedicated Settings toggle. The function filters on
-- `notification_prefs.recommendations !== false` (index.ts, and its own comment
-- calls it the "closest existing opt-out toggle"), so a user who wants
-- recommendations but not streak nagging cannot express that. Tracked separately.
--
-- NOT YET APPLIED, and blocked on the function deploy above, not just on this
-- file. The access token supplied on 2026-10-01 returned 401, so neither the
-- deploy nor this has been run. Stamp this footer once it has.
