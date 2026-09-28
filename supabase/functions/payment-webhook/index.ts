// Receives payment confirmation webhooks from the chosen gateway (Razorpay, Cashfree or PhonePe PG --
// TODO: the spec lists this as an open question; pick one before wiring this up for real). Verifies
// the webhook signature, then records the payment: online payments must be confirmed ONLY by this
// server-to-server webhook, never by the browser redirect (spec: "Payments" section).
//
// TODO before this can go live:
//   - Payment gateway account + webhook signing secret
//   - Map the gateway's payment/order id back to our bills.id (create-payment should store that
//     mapping when it creates the gateway order)
//
// Expected flow once wired: verify signature -> look up the bill by the gateway's order/payment id ->
// call add_payment(bill_id, 'online', amount, gateway_payment_id) via a service-role client -> if the
// bill's payments now sum to its total, call mark_paid(bill_id).

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const payload = await req.text();
  console.log("payment-webhook TODO: verify signature and record payment", payload.slice(0, 500));

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "payment-webhook needs a payment gateway chosen and configured first" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
