// Chapter update push pipeline. Runs on a pg_cron schedule (every 6h):
// reads chapter_watch, asks MangaDex for each watched manga's latest English
// chapter, and pushes "Chapter N is out" to users who haven't seen it yet.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: watches } = await supabase
    .from("chapter_watch")
    .select("user_id, series_title, manga_id, last_seen_chapter, last_notified_chapter")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (!watches?.length) {
    return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const byManga = new Map<string, typeof watches>();
  for (const w of watches) {
    if (!byManga.has(w.manga_id)) byManga.set(w.manga_id, []);
    byManga.get(w.manga_id)!.push(w);
  }

  // Cap per run — the cron comes back around, and MangaDex rate-limits ~5 req/s
  const mangaIds = [...byManga.keys()].slice(0, 150);
  const updates: { user_id: string; manga_id: string; latest: number }[] = [];
  const pushes: { user_id: string; title: string; chapter: number }[] = [];

  for (const mid of mangaIds) {
    try {
      const r = await fetch(
        `https://api.mangadex.org/manga/${mid}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=1` +
          `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`,
        { headers: { Accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = await r.json();
      const latest = parseFloat(j?.data?.[0]?.attributes?.chapter);
      if (!Number.isFinite(latest)) continue;

      for (const w of byManga.get(mid)!) {
        const known = Math.max(Number(w.last_seen_chapter) || 0, Number(w.last_notified_chapter) || 0);
        if (latest > known) {
          updates.push({ user_id: w.user_id, manga_id: mid, latest });
          pushes.push({ user_id: w.user_id, title: w.series_title, chapter: latest });
        }
      }
    } catch (_) {
      // one bad manga must not kill the run
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  // Expo push tokens for everyone owed a notification
  const userIds = [...new Set(pushes.map((p) => p.user_id))];
  let tokenMap = new Map<string, string>();
  if (userIds.length) {
    // Moved out of profiles in migration 62 — profiles is world-readable.
    const { data: settings } = await supabase
      .from("user_push_settings")
      .select("user_id, push_token")
      .in("user_id", userIds);
    tokenMap = new Map(
      (settings ?? []).filter((p) => p.push_token).map((p) => [p.user_id, p.push_token as string]),
    );
  }

  const messages = pushes
    .filter((p) => tokenMap.has(p.user_id))
    .map((p) => ({
      to: tokenMap.get(p.user_id),
      sound: "default",
      title: p.title,
      body: `Chapter ${p.chapter} is out — tap to read!`,
      data: { type: "chapter_update", series_title: p.title, chapter: p.chapter },
    }));

  for (let i = 0; i < messages.length; i += 100) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch(() => {});
  }

  // Mark notified + drop in-app notification rows (works even without a push token)
  for (const u of updates) {
    await supabase
      .from("chapter_watch")
      .update({ last_notified_chapter: u.latest })
      .eq("user_id", u.user_id)
      .eq("manga_id", u.manga_id);
  }
  if (pushes.length) {
    await supabase.from("notifications").insert(
      pushes.map((p) => ({
        user_id: p.user_id,
        type: "system",
        data: { kind: "chapter_update", series_title: p.title, chapter: p.chapter },
      })),
    );
  }

  return new Response(
    JSON.stringify({ checked: mangaIds.length, notified: messages.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
