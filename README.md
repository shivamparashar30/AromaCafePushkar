# Restaurant Management System

Supabase backend + Admin dashboard for the restaurant management system described in the technical
spec. Backend (schema, RLS, RPC functions) is done; the Admin dashboard is a first vertical slice
(6 of 11 modules fully built). Customer web, Waiter Android and Kitchen Android are not started.

## What's here

```
supabase/
  config.toml              local dev config; registers the custom access token hook
  migrations/               0001-0011, applied in order (see comments at the top of each file)
  seed.sql                  one sample outlet, 6 tables, a small menu, one staff member per role
  functions/
    staff-pin-login/        fully implemented: phone+PIN -> real Supabase Auth session
    send-bill/               stub (needs a WhatsApp/BSP account -- see TODO in the file)
    send-push/                stub (needs Firebase/FCM credentials)
    payment-webhook/          stub (needs a payment gateway decision)
    whatsapp-webhook/         stub (needs the Meta WhatsApp Cloud API app)
    create-payment/           stub (needs a payment gateway decision)
    export-report/            stub (needs the admin dashboard's report layout first)
tests/pgtap/                 RLS/RPC test scaffold (kitchen, waiter, customer isolation)
apps/admin/                  React/Vite admin dashboard (see apps/admin/README.md)
```

## Running it locally

Requires Docker (this session used Colima) and the Supabase CLI.

```bash
supabase start          # spins up local Postgres/Auth/Realtime/Storage/Studio via Docker
supabase db reset        # re-applies all migrations + seed.sql from scratch
supabase test db tests/pgtap --local   # runs the pgTAP suite (17 assertions, all passing)
supabase stop             # when done
```

`supabase status` prints the local API URL, anon key and service role key — copy those into a
`.env` (see `.env.example`) once a client starts consuming this backend. Studio (a Postgres/Auth
GUI) is at the `STUDIO_URL` `supabase status` prints.

## Design decisions worth knowing

- **Single restaurant now, multi-outlet-ready later**: every table carries `outlet_id`; roles are
  provisioned per-outlet via `provision_default_roles()` / `provision_outlet()` rather than being
  global, so a second outlet is a new row, not a schema change.
- **Customer orders go straight to kitchen** (no mandatory waiter confirmation), per your call —
  `table_sessions.requires_order_confirmation` exists in the schema if you want to flip this on
  later (per-table or globally via `outlets.settings`), but nothing currently enforces it.
- **RBAC via JWT custom claims**: a Postgres Auth Hook (`custom_access_token_hook`, registered in
  `config.toml`) stamps `app_role` / `outlet_id` / `profile_id` onto every staff JWT. It's named
  `app_role`, not `role` — the top-level `role` claim is reserved by GoTrue/PostgREST to pick the
  Postgres connection role (authenticated/anon/service_role); overwriting it breaks every request.
- **Multi-step actions are RPC functions, not client-side transactions**: `place_order`,
  `claim_table`, `set_item_status`, `create_bill`, `mark_paid`, etc. are `SECURITY DEFINER`
  functions that do their own role checks and write `order_events`/`audit_logs` as they go. Most
  tables have no direct client INSERT/UPDATE grant for these actions — RLS is the backstop, the RPC
  functions are the actual gate. See the comment at the top of `0010_functions_rpc.sql`.
- **Multiple diners per table**: `table_session_customers` binds every anonymous customer
  `auth.uid()` that scans a table's QR to the same `table_sessions` row, so friends share one cart
  (spec: "later scans on the same table join the same session").
- **Bill numbering**: `bill_counters` + `allocate_bill_number()` hands out gap-free sequential
  numbers per outlet per financial year, allocated only when a bill is finalised (`mark_paid`), via
  a row-locking `UPDATE ... RETURNING` (safe under concurrent finalizations).
- **GST/tax calculation** (`compute_bill_totals` in `0010_functions_rpc.sql`) is a reasonable
  first-pass implementation (tax per line item's own tax group, pro-rated for discount; service
  charge on the discounted subtotal) but **the spec explicitly flags this as needing your
  accountant's sign-off** before going live — inclusive vs. exclusive pricing and whether service
  charge is itself taxable both affect the numbers.
- **Database webhooks to Edge Functions** (`notify_bill_paid`, `notify_push` in
  `0011_triggers.sql`) use `pg_net` and read the target URL/service key from Postgres settings that
  are **not** set by any migration (no secrets belong in migration files). They no-op silently until
  you set them:
  ```sql
  alter database postgres set app.settings.supabase_url = 'http://host.docker.internal:54321';
  alter database postgres set app.settings.service_role_key = '<service_role key>';
  ```
  In production, Supabase's managed Database Webhooks (Dashboard) are a simpler alternative to this
  trigger-based approach.

## Verified end-to-end (this session)

Ran the full order lifecycle directly against the local stack: waiter claims a table
(`claim_table`) → places an order with a variant (`place_order`) → kitchen marks it ready
(`set_order_status`, which correctly fired one `order_ready` notification) → waiter marks it served
→ `create_bill` computes subtotal/service charge/GST/round-off correctly against the seeded tax
groups → `add_payment` + `mark_paid` generates bill number `INV/2026-27/000001`, closes the table
session, and frees the table for cleaning. `order_events` and `audit_logs` were both populated
correctly. Full pgTAP suite (kitchen/waiter/customer RLS isolation) passes: 17/17.

## Seeded local dev accounts

Outlet: "Spice Route Kitchen". All PINs are `1234`.

| Name | Role | Phone |
| --- | --- | --- |
| Anirudh Sharma | super_admin | +911000000001 |
| Meera Iyer | manager | +911000000002 |
| Sanjay Rao | cashier | +911000000003 |
| Ravi Kumar | waiter | +911000000004 |
| Chef Arjun | kitchen | +911000000005 |
| Priya Nair | waiter (2nd, for transfer-flow testing) | +911000000006 |

Log in via the `staff-pin-login` Edge Function: `POST /functions/v1/staff-pin-login` with
`{ "phone": "+911000000004", "pin": "1234", "device_identifier": "some-device-id", "platform": "android_waiter" }`.

## Admin dashboard (apps/admin)

First vertical slice, verified end-to-end against this backend in the browser (Playwright): login
as each office role (super_admin/manager/cashier), the full claim table → place order → create
bill → pay → mark paid loop, and role-gating (cashier correctly sees a read-only Menu/Tables view
and a trimmed-down sidebar). Fully built: Overview, Table structure, Menu management, QR code
generator, Live table ordering, Bills. Bookings/Sales & reports/Employee management/Customers/
Settings are routed placeholders. Full details in `apps/admin/README.md`.

One real bug worth flagging since it'll bite any client, not just this one: the `roles` table's
original RLS policy only let super_admin/manager read it, which silently broke every other role's
ability to resolve "what's my own role" (needed to embed `profiles -> roles(name)`). Fixed in
`0009_rls_policies.sql` — `roles` is now readable by all staff in the outlet (role names aren't
sensitive; the actual permission matrix in `role_permissions` stays admin/manager-only).

## Not built yet (flagged, not started)

- Customer web, Waiter Android, Kitchen Android apps.
- 5 of the Admin dashboard's 11 modules (see above).
- Real WhatsApp / FCM / payment gateway wiring — see the TODO comment at the top of each stub in
  `supabase/functions/`.
- A production Supabase project — everything above is local-only via the CLI.

## Open questions from the spec, still unresolved

These were flagged in the original spec and don't block the backend, but will shape the client
apps and production setup:

- Which payment gateway (Razorpay / Cashfree / PhonePe PG / Paytm)?
- Direct Meta WhatsApp Cloud API, or a BSP (Gupshup/Interakt/AiSensy/Wati)?
- Own-restaurant use, or a SaaS product sold to multiple restaurants? (Changes onboarding/billing,
  not the core schema — `outlet_id` is already there.)
- One kitchen screen or several stations (Tandoor/Chinese/Bar)? KOT printer needed?
- Waiters' own phones, or restaurant-provided Android devices?
- Thermal bill printer model and connection (Bluetooth/USB/LAN)?
- Any need to sync with Swiggy/Zomato or an accounting tool like Tally?
