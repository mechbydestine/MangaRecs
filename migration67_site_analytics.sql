-- ============================================================================
-- migration67_site_analytics.sql
--
-- Two things the mangarecs.net marketing site needs, both anon-facing and
-- both deliberately write-only from the browser:
--
--   1. site_events  — a first-party page counter. No cookies, no ids, no way
--                     to tie a row to a person. Anon can INSERT and nothing
--                     else; only the service role (i.e. you, in the Supabase
--                     dashboard) can read it back.
--   2. launch_notify_count() — lets the launch page show how many people are
--                     on the waitlist without exposing a single email. RLS
--                     already blocks anon SELECT on launch_notify; this
--                     security-definer function can only ever return a count.
--
-- Safe to re-run.
-- ============================================================================

-- ── 1. Page counter ─────────────────────────────────────────────────────────
create table if not exists public.site_events (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  path          text        not null,
  referrer_host text,
  width_bucket  text,
  lang          text
);

-- Keep the columns narrow enough that nobody can smuggle a payload in.
alter table public.site_events
  drop constraint if exists site_events_sane_lengths;
alter table public.site_events
  add constraint site_events_sane_lengths check (
    length(path) <= 300
    and (referrer_host is null or length(referrer_host) <= 255)
    and (width_bucket is null or width_bucket in ('xs', 'sm', 'md', 'lg', 'xl'))
    and (lang is null or length(lang) <= 12)
  );

create index if not exists site_events_created_at_idx on public.site_events (created_at desc);
create index if not exists site_events_path_idx on public.site_events (path);

alter table public.site_events enable row level security;

-- Insert-only for anon: the browser can add a view, and can never read the
-- table back (no select policy exists, so select is denied by default).
drop policy if exists "anon can record a page view" on public.site_events;
create policy "anon can record a page view"
  on public.site_events
  for insert
  to anon, authenticated
  with check (true);

grant insert on public.site_events to anon, authenticated;
grant usage, select on sequence public.site_events_id_seq to anon, authenticated;

-- ── 2. Waitlist count without exposing emails ───────────────────────────────
create or replace function public.launch_notify_count()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from public.launch_notify;
$$;

revoke all on function public.launch_notify_count() from public;
grant execute on function public.launch_notify_count() to anon, authenticated;

-- ── Handy reads for later (run these yourself, service role only) ───────────
-- select date_trunc('day', created_at) as day, count(*)
--   from site_events group by 1 order by 1 desc limit 30;
-- select path, count(*) from site_events
--   where created_at > now() - interval '7 days' group by 1 order by 2 desc;
-- select referrer_host, count(*) from site_events
--   where referrer_host is not null and created_at > now() - interval '7 days'
--   group by 1 order by 2 desc limit 25;
