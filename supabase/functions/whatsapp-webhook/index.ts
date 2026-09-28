// Receives Meta's delivery status callbacks for WhatsApp bill messages (sent -> delivered -> read /
// failed) and updates the matching whatsapp_messages row. Also handles Meta's webhook verification
// handshake (GET with hub.challenge) required when registering the webhook URL.
//
// TODO before this can go live: Meta Business Manager + WhatsApp Cloud API app, and a webhook verify
// token (set as a Supabase secret, compared against `hub.verify_token` on the GET handshake).
//
// Expected flow once wired: GET request from Meta during setup -> echo back hub.challenge if
// hub.verify_token matches. POST requests -> parse the statuses[] array, match each by wa_message_id,
// update whatsapp_messages.status/error accordingly.

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    console.log("whatsapp-webhook TODO: verify hub.challenge against a configured verify token");
    return new Response("not_implemented", { status: 501, headers: corsHeaders });
  }

  const payload = await req.json().catch(() => null);
  console.log("whatsapp-webhook TODO: update whatsapp_messages delivery status", payload);

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "whatsapp-webhook needs a Meta WhatsApp Cloud API app configured first" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
