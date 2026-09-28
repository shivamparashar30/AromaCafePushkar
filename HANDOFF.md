# Handoff — Restaurant Management System

Last updated: 2026-09-28. Written so a new person (or a fresh Claude session) can pick this up
without re-reading the whole conversation history.

**Start here:** read this file, then `README.md` (backend) and `apps/admin/README.md` (dashboard)
for the deeper technical details. The original product spec is not in this repo — ask whoever
handed you this project for `Restaurant Management System — Technical Specification.md`.

## What this project is

A restaurant management system: one Supabase backend serving four clients (Super Admin dashboard,
Customer ordering web page, Waiter/Kitchen React Native app). Every order flows
customer/waiter → kitchen → waiter → bill, pushed live to every screen.

## What's done

### 1. Backend (Supabase) — complete for Phase 1

Full Postgres schema (~25 tables), Row Level Security enforcing the spec's role matrix, and
`SECURITY DEFINER` RPC functions for every multi-step action (`place_order`, `claim_table` /
`transfer_table`, `set_item_status` / `set_order_status`, `cancel_item`, `create_bill` /
`apply_discount` / `add_payment` / `mark_paid` / `void_bill`, `report_sales`, `resolve_qr`, and
more). A custom JWT claims hook stamps `app_role`/`outlet_id`/`profile_id` onto every staff
session. Two Edge Functions are fully implemented:
- `staff-pin-login` — phone+PIN → real Supabase Auth session (for mobile staff apps)
- `manage-staff` — staff CRUD (create/update/reset PIN/toggle active), used by the admin dashboard

The rest (`send-bill`, `send-push`, `payment-webhook`, `whatsapp-webhook`, `create-payment`,
`export-report`) are stubs with clear TODOs — they need external accounts that weren't set up
(WhatsApp/FCM/payment gateway — see "Open decisions" below).

Verified working: full pgTAP RLS test suite (17/17 passing, `tests/pgtap/`), and the complete
order→kitchen→serve→bill→pay lifecycle run by hand against the local stack.

**Where:** `supabase/migrations/0001`–`0011`, `supabase/seed.sql`, `supabase/functions/`.
Full details: root `README.md`.

### 2. Admin dashboard (`apps/admin/`) — all 11 modules built

React + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Recharts, talking directly to
Supabase (no custom backend server). TypeScript compiles clean, Vite build passes.

**Fully built:**
- Overview — live tiles, sales-by-hour / 7-day-trend / top-dishes / category charts, floor map,
  alerts.
- Table structure — floors/tables CRUD.
- Menu management — categories, items, variants, add-ons, bulk stock/price tools.
- QR code generator — per-table QR, PNG download, print-to-PDF sheet.
- Live table ordering — claim table → place order → create bill → record payment → mark paid.
- Bills — filterable list, detail sheet, void.
- **Employee management** — staff list with role badges, add/edit via `manage-staff` Edge Function,
  PIN reset, device management (view/revoke registered devices). Super admin only for writes,
  manager can view.
- **Customers** — searchable customer list, add/edit (name, phone, WhatsApp opt-in), shows visit
  count and total spend.
- **Bookings overview** — next-7-day bookings with status filter (booked/arrived/no-show/cancelled),
  new booking form (guest name, phone, party size, date/time, source), status actions.
- **Sales and reports** — revenue trend chart (7d/30d/90d/1y), grouped by day/month/year/waiter via
  `report_sales` RPC, summary tiles (net/bills/tax/discounts), tabbed dish performance (from
  `v_dish_sales`) and table utilisation (from `v_table_sales`).
- **Settings** (super_admin only) — outlet details (name, address, GSTIN, FSSAI), ordering toggles
  (QR ordering, online ordering, online payment, first-order confirmation, direct table takeover),
  service charge config, bill prefix, tax groups CRUD.

Role-based UI gating (super_admin / manager / cashier) is verified: cashier sees a trimmed sidebar
and read-only Menu/Tables.

### 3. Mobile staff app (`apps/mobile/`) — React Native (Expo)

Expo Router project with phone+PIN login via the `staff-pin-login` Edge Function. Routes based
on role (waiter gets tab-based tables/alerts/account; kitchen gets orders/account).

**Waiter app:**
- Tables list with color-coded status, "my tables" vs others, claim-to-start
- Session detail: view orders (with realtime updates), add items from menu, mark ready items
  as served, create bill
- Notifications: live alerts (order ready, call waiter, bill requested) with dismiss

**Kitchen app:**
- Live order queue (placed/cooking), sorted oldest-first, urgent highlight after 15 min
- Per-item "Start" (→ cooking) and "Ready" buttons, plus bulk "Start all" / "All ready"
- Station labels visible, realtime subscription for new orders

Both apps persist sessions via SecureStore and auto-refresh via Supabase.

### 4. Customer web app (`apps/customer/`) — Next.js

Mobile-web ordering page, no install needed. Customer scans table QR → anonymous Supabase auth →
`resolve_qr` RPC returns outlet info, table, and full nested menu.

**Built:**
- QR landing page at `/table/[token]` — category tabs, veg/non-veg indicators, add to cart
- Cart with quantity controls, place order via `place_order` RPC
- Live order status tracking (realtime subscription on orders/order_items)
- Call waiter and request bill buttons

### Known bugs found and fixed

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

1. **Mobile app polish**: variant/addon picker in waiter's order flow (currently adds the base
   item only), transfer table between waiters, bill detail/payment flow on mobile, push
   notifications via FCM, proper kiosk mode for kitchen tablets.
2. **Customer web polish**: variant/addon selection, payment integration, bill view.
3. **Real external integrations**: WhatsApp Cloud API (or a BSP), Firebase/FCM, a payment gateway.
   The Edge Function stubs and their TODOs are the starting point — see
   `supabase/functions/*/index.ts`.
4. **Production Supabase project**: everything so far is local-only via the CLI. No hosted project
   exists yet.
5. **Testing**: E2E tests for admin dashboard (Playwright was used to manually verify; should be
   automated), mobile app testing.

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

## Getting the environment running

### Backend

Requires Docker (Colima or Docker Desktop) and the Supabase CLI.

```bash
colima start                      # if Docker isn't already running
supabase start                    # spins up Postgres/Auth/Realtime/Storage/Studio
supabase db reset                 # applies all migrations + seed.sql fresh
supabase test db tests/pgtap --local   # should show 17/17 passing
```

`supabase status` prints the local API URL, anon key and service role key.

### Admin dashboard

```bash
cd apps/admin
cp .env.local.example .env.local  # fill in from `supabase status`
npm install
npm run dev                       # http://localhost:5173
```

Login: `admin@spiceroute.test` / `password123` (super_admin). See `README.md` for other accounts.

### Mobile staff app

```bash
cd apps/mobile
cp .env.example .env              # fill in from `supabase status`
npm install
npx expo start                    # scan QR with Expo Go, or use emulator
```

Login: phone `+911000000004` (waiter) or `+911000000005` (kitchen), PIN `1234`.

### Customer web app

```bash
cd apps/customer
cp .env.local.example .env.local  # fill in from `supabase status`
npm install
npm run dev                       # http://localhost:3000
```

Visit `http://localhost:3000/table/<qr_token>` — get the token from `supabase/seed.sql` or the
QR page in the admin dashboard.

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
- Mobile app uses Expo Router (file-based routing in `app/` directory). UI is vanilla React Native
  StyleSheet — no component library, keeping it lightweight.
