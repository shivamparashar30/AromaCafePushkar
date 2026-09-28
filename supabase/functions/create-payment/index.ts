// Called by the customer page when "Online payment" is on and the diner taps Pay. Creates an order
// on the chosen payment gateway (UPI intent / card) and returns whatever the client SDK needs to
// launch the payment (e.g. a Razorpay order id, or a Cashfree payment session id).
//
// TODO before this can go live: pick and configure a gateway (see payment-webhook's TODO -- same
// open question from the spec). Store the mapping from the gateway's order id back to bills.id so
// payment-webhook can find the bill when the confirmation arrives.
//
// Expected request body: { bill_id: string }. Must verify the caller is the customer bound to that
// bill's table session (same check as the RLS customer policies) before creating a gateway order.

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { bill_id } = await req.json().catch(() => ({ bill_id: undefined }));
  console.log("create-payment TODO: create a gateway order for bill", bill_id);

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "create-payment needs a payment gateway chosen and configured first" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
