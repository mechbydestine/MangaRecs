// Reading-streak reminder push. Runs on a pg_cron schedule (once daily): finds
// users with an active streak (streak_count > 0) who haven't opened the app
// yet today and haven't already gotten today's reminder, and nudges them
// before midnight breaks the streak. Mirrors chapter-push's shape/pattern.
//
// NOT YET DEPLOYED OR SCHEDULED — see supabase_migrations.sql §56 for the
// pg_cron setup this needs once `supabase functions deploy streak-reminder`
// has been run.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);
  const startOfToday = `${today}T00:00:00.000Z`;

  const { data: atRisk, error } = await supabase
    .from("profiles")
    .select("id, streak_count, push_token, notification_prefs, last_streak_reminder_sent")
    .gt("streak_count", 0)
    .lt("last_active_at", startOfToday)
    .not("push_token", "is", null)
    .limit(2000);

  if (error || !atRisk?.length) {
    return new Response(JSON.stringify({ checked: 0, notified: 0, error: error?.message }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Closest existing opt-out toggle (SettingsScreen has no dedicated "streak
  // reminder" preference yet) — skip anyone who explicitly turned off
  // recommendation-style nudges, and anyone already reminded today.
  const eligible = atRisk.filter((p) =>
    p.notification_prefs?.recommendations !== false &&
    p.last_streak_reminder_sent !== today &&
    !!p.push_token
  );

  if (!eligible.length) {
    return new Response(JSON.stringify({ checked: atRisk.length, notified: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = eligible.map((p) => ({
    to: p.push_token,
    sound: "default",
    title: "Don't lose your streak!",
    body: `You're on a ${p.streak_count}-day reading streak — read a chapter today to keep it alive.`,
    data: { type: "streak_reminder" },
  }));

  // Expo's push API caps a single request at 100 messages
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
    } catch (_) {
      // one bad batch must not kill the run
    }
  }

  await supabase
    .from("profiles")
    .update({ last_streak_reminder_sent: today })
    .in("id", eligible.map((p) => p.id));

  return new Response(JSON.stringify({ checked: atRisk.length, notified: eligible.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
