// Triggered by the bills table webhook trigger (see 0011_triggers.sql: notify_bill_paid) when a bill
// is marked paid. Renders the bill PDF, stores it in Supabase Storage, and sends it over WhatsApp.
//
// TODO before this can go live (see spec: "Billing, payments and WhatsApp bill" and the WhatsApp
// pre-requisites checklist):
//   - Meta Business Manager + WhatsApp Cloud API app (or a BSP: Gupshup/Interakt/AiSensy/Wati)
//   - An approved "utility template" for the bill message
//   - A PDF renderer (e.g. a headless Chromium call, or a library like `pdf-lib`) for the bill layout
//   - SMS fallback provider for when WhatsApp isn't available (spec: "offer an SMS with a short bill link")
//
// Expected request body: { bill_id: string }
// On success: fetches the bill + line items + customer via the service role client, renders a PDF,
// uploads it to the `bills` Storage bucket, inserts a `whatsapp_messages` row (status: 'queued'),
// then calls the WhatsApp Cloud API's /messages endpoint with the PDF as a document header. Meta's
// delivery webhooks (see whatsapp-webhook) update that row's status afterwards.

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { bill_id } = await req.json().catch(() => ({ bill_id: undefined }));
  console.log("send-bill TODO: render PDF + send WhatsApp for bill", bill_id);

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "send-bill needs WhatsApp/BSP credentials before it can send anything" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
