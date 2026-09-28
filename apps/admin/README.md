# Admin Dashboard

React + Vite + TypeScript admin dashboard for the restaurant management system, talking directly
to the Supabase backend in `../../supabase`. First vertical slice — see the repo root README for
what's built vs. still a placeholder.

## Running locally

Needs the local Supabase stack running (`supabase start` from the repo root).

```bash
cp .env.local.example .env.local   # fill in from `supabase status`
npm install
npm run dev
```

## Fully implemented modules

Overview (live tiles, charts, floor map, alerts), Table structure (floors/tables CRUD, QR-ready),
Menu management (categories/items/variants/add-ons, bulk stock/price tools), QR code generator
(per-table QR, PNG download, print-to-PDF sheet), Live table ordering (claim table, place orders
with variants/add-ons, discounts, payments, mark paid — this is the one that exercises the backend
RPCs end to end), Bills (filterable list, detail, void).

## Placeholder modules

Bookings, Sales & reports (beyond what Overview shows), Employee management, Customers, Settings —
routed and in the sidebar, not built out yet.

## Architecture notes

- **Auth**: email+password only (`supabase.auth.signInWithPassword`) — matches the spec's
  "admins use email + password" (waiter/kitchen use phone+PIN in their own apps, not this one).
- **Role gating**: `src/components/layout/nav.ts` filters the sidebar by role; every actual
  permission check happens server-side (RLS + the RPC functions' own checks) — the UI gating is
  just to avoid showing actions that would fail, not the real security boundary.
- **Data layer**: TanStack Query wrapping `supabase-js`; `src/lib/realtime.ts` is a small hook that
  subscribes to Postgres Changes on a table and invalidates the given query keys, so screens stay
  live. **Known gotcha** (hit and fixed once already, see Bills' date-preset filter): never derive a
  query key from a fresh `new Date()`/object literal computed inline on every render — memoize it,
  or you get a new "unique" key every render and an infinite refetch loop.
- **Charts**: built per the dataviz skill — validated categorical/sequential palette in
  `src/index.css` (`--chart-1`..`--chart-8`) and `src/lib/chart-colors.ts`, bar/line forms chosen by
  the data's job (magnitude vs. part-to-whole), direct labels where the palette's contrast check
  requires them.
