// Triggered by the notifications table webhook trigger (see 0011_triggers.sql: notify_push) whenever
// a new alert is inserted (order ready, call waiter, bill requested, new unassigned table, ...).
// Looks up FCM tokens for the notification's target (or all on-duty staff in the outlet/area for a
// broadcast) and sends a high-priority FCM message so the Android apps get it even in background.
//
// TODO before this can go live (see spec: "Notifications and alert sounds"):
//   - A Firebase project + service account credentials for FCM HTTP v1 API
//   - Per-event sound/channel mapping to match the Android apps' notification channels
//
// Expected request body: the full `notifications` row (id, outlet_id, event, table_id, session_id,
// target_user_id, payload, created_at). Looks up devices.fcm_token for target_user_id (or every
// active device in the outlet/area when target_user_id is null), and posts one FCM message per token.

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const notification = await req.json().catch(() => null);
  console.log("send-push TODO: forward to FCM", notification);

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "send-push needs Firebase/FCM credentials before it can send anything" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
