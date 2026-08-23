// User-to-user push notifications (DM / comment / friend request).
//
// These used to be sent straight from the client: the device read the
// RECIPIENT's push_token out of `profiles` and POSTed to Expo itself. That
// required `profiles.push_token` to be world-readable, which meant anyone with
// the (publicly shipped) anon key could harvest every token in the userbase and
// push whatever they liked to all of it. It also meant `notification_prefs` was
// enforced on the SENDING device — i.e. not enforced at all.
//
// Everything that decides whether a push happens now lives here, behind the
// service_role key, following the same shape as chapter-push:
//   • the sender is taken from the JWT, never from the request body, so the
//     "from" name can't be spoofed
//   • notification_prefs is checked server-side
//   • blocks are honoured in both directions
//   • push_token is read with service_role, so the column can be locked down
//
// Deploy order matters: this function and the client that calls it must both be
// live BEFORE migration 62 drops profiles.push_token / notification_prefs.
import { createClient } from "npm:@supabase/supabase-js@2";

type NotifyType =
  | "direct_message"
  | "comment"
  | "reply"
  | "friend_request";

interface NotifyBody {
  type: NotifyType;
  recipientId?: string;
  seriesTitle?: string;
  preview?: string;
}

// notification_prefs key that gates each type. These must stay in step with
// PREF_GROUPS in utils/notificationPrefs.js — that module is the client-side
// source of truth and this is its server mirror.
const PREF_KEY: Record<NotifyType, string> = {
  direct_message: "directMessages",
  comment: "comments",
  reply: "replies",
  friend_request: "friendActivity",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing_auth" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identify the sender from the token, not the payload.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const senderId = userData?.user?.id;
  if (userErr || !senderId) return json({ error: "invalid_auth" }, 401);

  let body: NotifyBody;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "bad_json" }, 400);
  }

  const { type } = body;
  if (!type || !(type in PREF_KEY)) return json({ error: "bad_type" }, 400);

  // ── Resolve the recipient ────────────────────────────────────────────────
  // For comments the recipient is whoever owns the series — derived here rather
  // than trusted from the client, so a caller can't aim a "new comment" push at
  // an arbitrary user.
  let recipientId: string | undefined;
  let seriesTitle: string | undefined;

  if (type === "comment") {
    seriesTitle = body.seriesTitle;
    if (!seriesTitle) return json({ error: "missing_series" }, 400);
    const { data: series } = await admin
      .from("series")
      .select("creator_id")
      .eq("title", seriesTitle)
      .maybeSingle();
    recipientId = series?.creator_id ?? undefined;
  } else {
    recipientId = body.recipientId;
  }

  if (!recipientId) return json({ skipped: "no_recipient" });
  // Self-notification is always a no-op (commenting on your own series).
  if (recipientId === senderId) return json({ skipped: "self" });

  // ── Entitlement: blocks in either direction kill the push ────────────────
  // Mirrors what the app's blocking UI implies. Note the DB's DM insert policy
  // only checks sender identity, so friendship is deliberately NOT required
  // here — that would silently drop pushes the app currently allows.
  const { data: blocks } = await admin
    .from("blocked_users")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${senderId},blocked_id.eq.${recipientId}),` +
        `and(blocker_id.eq.${recipientId},blocked_id.eq.${senderId})`,
    )
    .limit(1);
  if (blocks?.length) return json({ skipped: "blocked" });

  // ── Recipient's token + preferences ──────────────────────────────────────
  // user_push_settings is owner-only under RLS; service_role bypasses it.
  const { data: recipient } = await admin
    .from("user_push_settings")
    .select("push_token, notification_prefs")
    .eq("user_id", recipientId)
    .maybeSingle();

  const token = recipient?.push_token;
  if (!token) return json({ skipped: "no_token" });
  if (recipient?.notification_prefs?.[PREF_KEY[type]] === false) {
    return json({ skipped: "opted_out" });
  }

  // ── Sender's display name, server-side ───────────────────────────────────
  const { data: sender } = await admin
    .from("profiles")
    .select("username, display_name")
    .eq("id", senderId)
    .maybeSingle();
  const fromName = sender?.display_name || sender?.username || "Someone";

  // ── Build the message ────────────────────────────────────────────────────
  let title: string;
  let bodyText: string;
  let data: Record<string, unknown>;

  if (type === "direct_message") {
    title = fromName;
    // The preview is the only caller-supplied string that reaches the payload;
    // clamp it so a long message can't bloat the push.
    bodyText = (body.preview || "Sent you a message").slice(0, 140);
    data = { type: "direct_message" };
  } else if (type === "comment") {
    title = "New comment on your series";
    bodyText = `${fromName} commented on ${seriesTitle}`;
    data = { type: "comment", series_title: seriesTitle };
  } else if (type === "reply") {
    title = "New reply";
    bodyText = body.seriesTitle
      ? `${fromName} replied to you on ${body.seriesTitle}`
      : `${fromName} replied to your comment`;
    data = { type: "reply", series_title: body.seriesTitle ?? null };
  } else {
    title = "New friend request";
    bodyText = `${fromName} sent you a friend request`;
    data = { type: "friend_request" };
  }

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, sound: "notification.mp3", title, body: bodyText, data }),
  }).catch(() => null);

  if (!res || !res.ok) return json({ error: "push_failed" }, 502);
  return json({ sent: true });
});
