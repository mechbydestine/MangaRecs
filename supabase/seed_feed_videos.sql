-- Seed rows for feed_videos (migration §64).
--
-- Run this AFTER the §64 block in supabase_migrations.sql — the table has to
-- exist first. Safe to re-run: ON CONFLICT keeps existing rows and refreshes
-- the metadata.
--
-- Every id below was verified against YouTube's oEmbed endpoint at the time of
-- writing (a 200 means the video is public and embeddable). Two candidates
-- returned 403/401 and were dropped rather than seeded, because a dead id
-- renders as a broken card, which is worse than no card. If one of these does
-- go away later, switch it off rather than deleting it:
--
--   UPDATE feed_videos SET active = FALSE WHERE video_id = '<id>';
--
-- These are all YouTube Shorts (vertical, under a minute) — the format the
-- card is built for. Longer landscape videos will play but letterbox badly in
-- a full-bleed vertical card.
--
-- duration_secs is left NULL: oEmbed does not report duration, and guessing a
-- number that then renders as a wrong "0:45" chip is worse than showing none.
-- The refill-feed-videos function fills it in properly from the Data API.

INSERT INTO feed_videos (provider, video_id, title, channel, thumbnail_url, topic, source, weight, active)
VALUES
  -- ── Manhwa ──────────────────────────────────────────────────────────────
  ('youtube', 'CQzlOJ1L328', 'Manhwa recommendations',                    'RIO',              'https://i.ytimg.com/vi/CQzlOJ1L328/hqdefault.jpg', 'manhwa', 'curated', 10, TRUE),
  ('youtube', 'PuVVhkF8S2U', 'Best Manhwa Recommendations',               'The Real Senpai',  'https://i.ytimg.com/vi/PuVVhkF8S2U/hqdefault.jpg', 'manhwa', 'curated', 10, TRUE),
  ('youtube', 'b2llX_06VK0', 'Probably the most fun manhwa to read',      'Ken-chan',         'https://i.ytimg.com/vi/b2llX_06VK0/hqdefault.jpg', 'manhwa', 'curated',  8, TRUE),
  ('youtube', '9veTzoJqKHo', 'Manhwa Recommendations, part 21',           'KOMIK RAIDERS',    'https://i.ytimg.com/vi/9veTzoJqKHo/hqdefault.jpg', 'manhwa', 'curated',  5, TRUE),
  ('youtube', 'THUihtHx0j4', 'Top ten BL manhwa recommendations',         'Mayu Rin',         'https://i.ytimg.com/vi/THUihtHx0j4/hqdefault.jpg', 'manhwa', 'curated',  5, TRUE),
  ('youtube', '_vl8KyNmdb4', 'Top 5 Short Red Flag BL Manhwa',            'Ani Diaz',         'https://i.ytimg.com/vi/_vl8KyNmdb4/hqdefault.jpg', 'manhwa', 'curated',  3, TRUE),

  -- ── Anime ───────────────────────────────────────────────────────────────
  ('youtube', '5Er6lDVPC_M', 'Short Anime Recommendations',               'Japanese with Jaee','https://i.ytimg.com/vi/5Er6lDVPC_M/hqdefault.jpg', 'anime',  'curated', 10, TRUE),
  ('youtube', 'GR1kebbVlgE', 'Best OP Edits',                             'HoshiRankings',    'https://i.ytimg.com/vi/GR1kebbVlgE/hqdefault.jpg', 'anime',  'curated',  8, TRUE),
  ('youtube', '1tA5itzjYKM', 'Anime edit',                                'Anime Lover',      'https://i.ytimg.com/vi/1tA5itzjYKM/hqdefault.jpg', 'anime',  'curated',  5, TRUE)
ON CONFLICT (provider, video_id) DO UPDATE SET
  title         = EXCLUDED.title,
  channel       = EXCLUDED.channel,
  thumbnail_url = EXCLUDED.thumbnail_url,
  topic         = EXCLUDED.topic,
  weight        = EXCLUDED.weight,
  active        = TRUE;

-- Adding more later, from a Shorts URL like
-- https://www.youtube.com/shorts/CQzlOJ1L328 — the id is the last path
-- segment. As the admin account you can also do it from the app's session:
--   select upsert_feed_video('youtube', '<id>', '<title>', '<channel>', null, 'manhwa', null, 0);
