// Called by the admin dashboard's report screens to download an Excel or PDF export. The reports
// themselves are already computed in Postgres (report_sales RPC, v_dish_sales/v_table_sales views);
// this function just formats the result as a file, since that's easier in JS than in SQL.
//
// TODO: pick an Excel/PDF library (e.g. `exceljs` and a headless-Chromium or `pdf-lib` PDF renderer)
// once the admin dashboard's report screens exist and we know the exact columns/layout they need.
//
// Expected request body: { report: string, format: 'xlsx' | 'pdf', from: string, to: string, group_by?: string }
// Calls the matching RPC/view with a service-role client scoped to the caller's outlet (forwarding
// the caller's JWT rather than using the service role would be safer once this is implemented, so
// the existing RLS/report_sales permission checks apply instead of duplicating them here).

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const params = await req.json().catch(() => null);
  console.log("export-report TODO: render export file", params);

  return new Response(
    JSON.stringify({ status: "not_implemented", message: "export-report needs a report layout and an Excel/PDF library chosen first" }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
