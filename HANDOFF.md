# Handoff — Restaurant Management System

Last updated: 2026-09-28. Written so a new person (or a fresh Claude session) can pick this up
without re-reading the whole conversation history.

**Start here:** read this file, then `README.md` (backend) and `apps/admin/README.md` (dashboard)
for the deeper technical details. The original product spec is not in this repo — ask whoever
handed you this project for `Restaurant Management System — Technical Specification.md`.

## What this project is

A restaurant management system: one Supabase backend serving four clients (Super Admin dashboard,
Customer ordering web page, Waiter Android app, Kitchen Android app). Every order flows
customer/waiter → kitchen → waiter → bill, pushed live to every screen.

## What's done

### 1. Backend (Supabase) — complete for Phase 1

Full Postgres schema (~25 tables), Row Level Security enforcing the spec's role matrix, and
`SECURITY DEFINER` RPC functions for every multi-step action (`place_order`, `claim_table` /
`transfer_table`, `set_item_status` / `set_order_status`, `cancel_item`, `create_bill` /
`apply_discount` / `add_payment` / `mark_paid` / `void_bill`, `report_sales`, `resolve_qr`, and
more). A custom JWT claims hook stamps `app_role`/`outlet_id`/`profile_id` onto every staff
session. One Edge Function (`staff-pin-login`) is fully implemented; the rest
(`send-bill`, `send-push`, `payment-webhook`, `whatsapp-webhook`, `create-payment`,
`export-report`) are stubs with clear TODOs — they need external accounts that weren't set up
(WhatsApp/FCM/payment gateway — see "Open decisions" below).

Verified working: full pgTAP RLS test suite (17/17 passing, `tests/pgtap/`), and the complete
order→kitchen→serve→bill→pay lifecycle run by hand against the local stack.

**Where:** `supabase/migrations/0001`–`0011`, `supabase/seed.sql`, `supabase/functions/`.
Full details: root `README.md`.

### 2. Admin dashboard (`apps/admin/`) — first vertical slice

React + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Recharts, talking directly to
Supabase (no custom backend server).

**Fully built and verified in a real browser (Playwright: login, click through, screenshot,
check console for errors):**
- Overview — live tiles, sales-by-hour / 7-day-trend / top-dishes / category charts, floor map,
  alerts. Charts follow the `dataviz` skill (validated categorical/sequential palette in
  `src/index.css`, form chosen by data's job).
- Table structure — floors/tables CRUD.
- Menu management — categories, items, variants, add-ons, bulk stock/price tools.
- QR code generator — per-table QR, PNG download, print-to-PDF sheet.
- Live table ordering — the core operational loop: claim table → place order (with
  variant/add-on picker) → create bill → record payment → mark paid. This is the screen that
  exercises the most backend RPCs and was tested end-to-end.
- Bills — filterable list, detail sheet, void.

Role-based UI gating (super_admin / manager / cashier — the only roles that can log into this
dashboard, since it's email+password only) is verified: cashier sees a trimmed sidebar and
read-only Menu/Tables.

**Not built — routed placeholders only** ("Coming soon" page, present in the sidebar, no
functionality): Bookings overview, Sales and reports (beyond what Overview shows), Employee
management, Customers, Settings.

Full details: `apps/admin/README.md`.

### Two real bugs found and fixed while building/testing (worth knowing about)

1. **`roles` table RLS was too strict.** The original policy only let `super_admin`/`manager`
   read the `roles` table, which silently broke every other role's ability to resolve its own
   role name (needed by any client embedding `profiles -> roles(name)`). Fixed in
   `supabase/migrations/0009_rls_policies.sql` — `roles` is now readable by all staff in the
   outlet; the actual permission matrix (`role_permissions`) stays admin/manager-only.
2. **Infinite refetch loop in Bills' date filter.** `presetRange()` called `new Date()` inline on
   every render and that value fed straight into a TanStack Query key, so every render produced a
   "new" key and refetched — hundreds of requests/sec. Fixed with `useMemo` in
   `apps/admin/src/features/bills/BillsPage.tsx`. **If you build more date-range filters anywhere
   in this app, watch for this same pattern.**

## What's pending

Roughly in the order the spec's own delivery plan suggests, but nothing here is committed to —
whoever picks this up should re-confirm priorities:

1. **Finish the Admin dashboard**: Bookings, Sales & reports (deeper than Overview), Employee
   management (staff CRUD — currently staff are only created via `seed.sql`/SQL directly, there's
   no UI for it yet), Customers, Settings (tax config, ordering-mode switches, WhatsApp
   credentials, printer setup, bill numbering format).
2. **Customer web page** (Next.js, mobile web, no install) — QR scan → menu → cart → place order
   → live status → pay/request bill. Backend RPC `resolve_qr` and the anonymous-session RLS model
   are already built and pgTAP-tested for this; no frontend exists yet.
3. **Waiter Android app** (Kotlin + Jetpack Compose) — not started. Needs an Android toolchain in
   whatever environment picks this up.
4. **Kitchen Android app** (Kotlin + Compose, kiosk mode) — not started. Same toolchain need.
5. **Real external integrations**: WhatsApp Cloud API (or a BSP), Firebase/FCM, a payment gateway.
   The Edge Function stubs and their TODOs are the starting point — see
   `supabase/functions/*/index.ts`.
6. **Production Supabase project**: everything so far is local-only via the CLI. No hosted project
   exists yet.

## Open decisions (from the original spec, still unresolved)

These block some of the "pending" work above and need the project owner's input:

- Payment gateway: Razorpay / Cashfree / PhonePe PG / Paytm?
- WhatsApp: direct Meta Cloud API, or a BSP (Gupshup/Interakt/AiSensy/Wati)?
- Single restaurant, or a SaaS product for multiple restaurants? (Schema is already
  multi-outlet-ready via `outlet_id`; this mainly affects onboarding/billing, not the data model.)
- One kitchen screen or several stations (Tandoor/Chinese/Bar)? KOT printer needed?
- Waiters' own phones or restaurant-provided Android devices?
- Thermal bill printer model and connection (Bluetooth/USB/LAN)?
- Any need to sync with Swiggy/Zomato or an accounting tool like Tally?

## Getting the environment running again

This was built and tested with Docker via **Colima** (not Docker Desktop) and the Supabase CLI
installed as a standalone binary (not via Homebrew, which hit a Command Line Tools version issue
in this environment) at `/Users/anirudhsharma/Projects/.bin/supabase`. Adjust if your environment
differs.

```bash
colima start                      # if Docker isn't already running
cd /Users/anirudhsharma/Projects/restaurant-os
supabase start                    # spins up Postgres/Auth/Realtime/Storage/Studio
supabase db reset                 # applies all migrations + seed.sql fresh
supabase test db tests/pgtap --local   # should show 17/17 passing

cd apps/admin
cp .env.local.example .env.local  # fill in VITE_SUPABASE_ANON_KEY from `supabase status`
npm install
npm run dev                       # http://localhost:5173
```

Seeded login for the dashboard: `admin@spiceroute.test` / `password123` (super_admin). See
`README.md` for the manager/cashier accounts and the phone+PIN staff accounts (waiter/kitchen,
PIN `1234`, used via the `staff-pin-login` Edge Function rather than this dashboard).

## Conventions worth preserving

- Every migration file has a comment block at the top explaining its purpose and any non-obvious
  design decisions — read those before adding new ones.
- Money is always `bigint` paise in the DB; `apps/admin/src/lib/money.ts` is the one place that
  formats it as ₹ — don't reformat money ad hoc elsewhere.
- Multi-step/atomic actions belong in a Postgres RPC function (`SECURITY DEFINER`, doing its own
  role checks), not as multiple client-side calls — this is how the whole backend is structured
  and it's load-bearing for both correctness (atomicity) and security (RLS is the backstop, the
  RPC functions are the actual gate).
- New charts should follow the `dataviz` skill's method (form chosen by the data's job, the
  validated palette in `index.css`/`chart-colors.ts`, direct labels where required) rather than
  ad hoc colors/chart types.
