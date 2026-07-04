// Fires when a row is inserted into public.reports (via DB trigger + pg_net).
// Notifies the app owner/admin so reports don't sit unreviewed — pushes via
// Expo if they have a push token, and always drops an in-app notification.
import { createClient } from "npm:@supabase/supabase-js@2";

// Single-admin app: the owner's user id. Update if ownership changes.
const ADMIN_USER_ID = "4975b6bc-31df-4c97-ba04-8a5dfc2dc1f0";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const reportId = body?.record?.id ?? body?.id;
  if (!reportId) {
    return new Response(JSON.stringify({ error: "missing report id" }), { status: 400 });
  }

  const { data: report } = await supabase
    .from("reports")
    .select("id, reporter_id, content_id, reason, created_at")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return new Response(JSON.stringify({ error: "report not found" }), { status: 404 });
  }

  const { data: reporter } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", report.reporter_id)
    .maybeSingle();

  await supabase.from("notifications").insert({
    user_id: ADMIN_USER_ID,
    type: "system",
    data: {
      kind: "report_submitted",
      report_id: report.id,
      reason: report.reason,
      content_id: report.content_id,
      reporter: reporter?.username || "a user",
    },
  });

  const { data: admin } = await supabase
    .from("profiles")
    .select("push_token")
    .eq("id", ADMIN_USER_ID)
    .maybeSingle();

  if (admin?.push_token) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: admin.push_token,
        sound: "default",
        title: "New content report",
        body: `${reporter?.username || "Someone"} reported: ${report.reason}`,
        data: { type: "report_submitted", report_id: report.id },
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
