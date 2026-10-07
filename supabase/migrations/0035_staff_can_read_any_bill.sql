-- A waiter could raise a bill and then not see it.
--
-- 0034 made table assignment advisory for every billing ACTION, but the RLS policies that
-- govern READING bills and payments still required the session to be assigned to the
-- caller. On a customer-scanned session waiter_id is NULL, so the EXISTS was false and the
-- bill was invisible to every waiter — including the one who had just created it. The
-- customer page and the admin dashboard showed it; the waiter app did not.
--
-- The confusing part was that it appeared to fix itself: place_order auto-assigns the
-- waiter when a session has none, so adding any item made the bill show up. That made it
-- look like a stale-cache bug in the app rather than a permission one in the database.
--
-- Reading is strictly less sensitive than writing, and a waiter who may settle a bill must
-- be able to see it, so both policies now scope to the outlet only. Customers are
-- unaffected: bills_select_customer still limits a guest to their own session.
drop policy if exists bills_select_staff on bills;
create policy bills_select_staff on bills
  for select to authenticated
  using (is_staff(outlet_id));

drop policy if exists payments_select_staff on payments;
create policy payments_select_staff on payments
  for select to authenticated
  using (is_staff(outlet_id));
