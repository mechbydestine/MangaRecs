// Tops up `feed_videos` (migration §64) from the YouTube Data API.
//
// Meant to run on a pg_cron schedule (daily is plenty — the table only needs
// to stay ahead of how fast people scroll). Everything it writes is marked
// source='youtube_api', so a query that starts returning junk can be culled
// without touching the hand-curated rows.
//
// It is a deliberate no-op when YOUTUBE_API_KEY is unset. The feature ships
// curated-first: the app reads the same table either way, so this function can
// be deployed now and only starts doing work once a key exists.
//
// ── Quota ──────────────────────────────────────────────────────────────────
// The free tier is 10,000 units/day and search.list costs 100 units per call —
// so ~100 searches a day TOTAL, across the entire userbase. That is exactly
// why this is a scheduled server-side job writing to a table rather than the
// app calling YouTube per user, which would exhaust the quota inside minutes.
// QUERIES below is sized so one run costs 100 * QUERIES.length units.
import { createClient } from "npm:@supabase/supabase-js@2";

// Topic is stored with each row so the app can weight what it shows. Keep the
// query list short — every entry is another 100 units per run.
const QUERIES: { q: string; topic: "manga" | "manhwa" | "anime" }[] = [
  { q: "manhwa recommendations", topic: "manhwa" },
  { q: "manga recommendations", topic: "manga" },
  { q: "anime edit", topic: "anime" },
];

const PER_QUERY = 15;
// YouTube treats "short" as under 4 minutes. Shorts proper are 60s or less, so
// durations are checked again below and anything longer is dropped.
const MAX_DURATION_SECS = 180;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ISO-8601 (PT1M30S) -> seconds.
function parseDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

Deno.serve(async () => {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return json({ skipped: "no_api_key" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rows already known — including ones an admin has switched OFF, so a video
  // that was culled for being off-topic or taken down can't be re-added by the
  // next run.
  const { data: existing } = await supabase
    .from("feed_videos")
    .select("video_id")
    .eq("provider", "youtube");
  const known = new Set((existing ?? []).map((r) => r.video_id as string));

  const candidates: Record<string, unknown>[] = [];

  for (const { q, topic } of QUERIES) {
    try {
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
        `&videoDuration=short&videoEmbeddable=true&videoSyndicated=true` +
        `&safeSearch=strict&order=viewCount&relevanceLanguage=en` +
        `&maxResults=${PER_QUERY}&q=${encodeURIComponent(q)}&key=${apiKey}`;
      const res = await fetch(searchUrl);
      if (!res.ok) continue;
      const body = await res.json();
      const ids: string[] = (body.items ?? [])
        .map((i: Record<string, any>) => i?.id?.videoId)
        .filter((id: string) => id && !known.has(id));
      if (!ids.length) continue;

      // videos.list costs 1 unit and is the only way to get real durations —
      // search.list's `videoDuration=short` still allows anything under 4min.
      const detailUrl =
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,status` +
        `&id=${ids.join(",")}&key=${apiKey}`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      for (const item of detail.items ?? []) {
        const id = item?.id;
        if (!id || known.has(id)) continue;
        // status.embeddable is authoritative; the search filter is a hint.
        if (item?.status?.embeddable === false) continue;
        const secs = parseDuration(item?.contentDetails?.duration);
        if (!secs || secs > MAX_DURATION_SECS) continue;

        known.add(id);
        candidates.push({
          provider: "youtube",
          video_id: id,
          title: (item?.snippet?.title ?? "").slice(0, 200),
          channel: item?.snippet?.channelTitle ?? null,
          thumbnail_url:
            item?.snippet?.thumbnails?.high?.url ??
              item?.snippet?.thumbnails?.medium?.url ?? null,
          topic,
          duration_secs: secs,
          source: "youtube_api",
          active: true,
        });
      }
    } catch (_) {
      // One bad query must not kill the run.
    }
  }

  if (!candidates.length) return json({ inserted: 0 });

  const { error } = await supabase
    .from("feed_videos")
    .upsert(candidates, { onConflict: "provider,video_id", ignoreDuplicates: true });
  if (error) return json({ error: error.message }, 500);

  return json({ inserted: candidates.length });
});
