-- Row Level Security policies.
--
-- Design:
--  * Every table is scoped to the caller's outlet via the JWT `outlet_id` claim for staff, or via
--    the customer's bound table_session for anonymous diners.
--  * Direct client writes (INSERT/UPDATE/DELETE) are granted narrowly, mostly to super_admin/manager
--    for outlet configuration (menu, tables, staff, settings) matching the spec's permission matrix.
--  * Multi-step actions (place_order, claim_table, set_item_status, create_bill, mark_paid, ...) are
--    Postgres RPC functions marked SECURITY DEFINER and owned by the migration role (postgres), which
--    has BYPASSRLS in Supabase -- so those functions do their OWN role/permission checks in application
--    code (see 0011_functions_rpc.sql) rather than relying on table-level RLS for the write itself.
--    RLS here is the backstop for anything that reaches the tables directly.

create or replace function is_customer()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- The outlet of the customer's currently OPEN table session, if any.
-- SECURITY DEFINER is required here: table_sessions/table_session_customers' own RLS policies call
-- this function (and customer_session_id below) to decide row visibility. A non-definer function
-- would re-trigger RLS evaluation on its own internal query, recursing back into itself and blowing
-- the stack. Running as the owner (which has BYPASSRLS in Supabase) breaks that cycle.
create or replace function customer_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.outlet_id
  from table_session_customers tsc
  join table_sessions ts on ts.id = tsc.session_id
  join tables t on t.id = ts.table_id
  where tsc.customer_auth_id = auth.uid()
    and ts.status = 'open'
  limit 1;
$$;

create or replace function customer_session_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ts.id
  from table_session_customers tsc
  join table_sessions ts on ts.id = tsc.session_id
  where tsc.customer_auth_id = auth.uid()
    and ts.status = 'open'
  limit 1;
$$;

-- staff helper: is caller an active staff member of the given outlet?
create or replace function is_staff(p_outlet_id uuid)
returns boolean
language sql
stable
as $$
  select auth_role() is not null and auth_outlet_id() = p_outlet_id;
$$;

alter table outlets enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table devices enable row level security;
alter table floors enable row level security;
alter table tables enable row level security;
alter table table_sessions enable row level security;
alter table table_session_customers enable row level security;
alter table tax_groups enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table item_variants enable row level security;
alter table addon_groups enable row level security;
alter table addons enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_addons enable row level security;
alter table order_events enable row level security;
alter table bill_counters enable row level security;
alter table bills enable row level security;
alter table payments enable row level security;
alter table whatsapp_messages enable row level security;
alter table bookings enable row level security;
alter table attendance enable row level security;
alter table audit_logs enable row level security;
alter table daily_sales_summary enable row level security;
alter table notifications enable row level security;

-- ============ outlets ============

create policy outlets_select_staff on outlets
  for select to authenticated
  using (is_staff(id));

create policy outlets_update_super_admin on outlets
  for update to authenticated
  using (is_staff(id) and auth_role() = 'super_admin')
  with check (is_staff(id) and auth_role() = 'super_admin');

-- ============ roles / role_permissions ============
-- Every staff member can see the roles in their outlet (role names aren't sensitive, and every
-- client needs to resolve "which role am I" via profiles->roles). The actual permission matrix
-- (role_permissions below) stays admin/manager-only.

create policy roles_select_staff on roles
  for select to authenticated
  using (is_staff(outlet_id));

create policy roles_write_super_admin on roles
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() = 'super_admin')
  with check (is_staff(outlet_id) and auth_role() = 'super_admin');

create policy role_permissions_select_admin_manager on role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and is_staff(r.outlet_id)
        and auth_role() in ('super_admin', 'manager')
    )
  );

create policy role_permissions_write_super_admin on role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and is_staff(r.outlet_id) and auth_role() = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and is_staff(r.outlet_id) and auth_role() = 'super_admin'
    )
  );

-- ============ profiles ============

create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth_profile_id());

create policy profiles_select_admin_manager on profiles
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy profiles_write_super_admin on profiles
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() = 'super_admin')
  with check (is_staff(outlet_id) and auth_role() = 'super_admin');

-- ============ devices ============

create policy devices_select_self on devices
  for select to authenticated
  using (user_id = auth_profile_id());

create policy devices_select_admin_manager on devices
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy devices_write_self on devices
  for all to authenticated
  using (user_id = auth_profile_id())
  with check (user_id = auth_profile_id());

create policy devices_write_admin on devices
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ floors / tables ============
-- Kitchen gets read-only SELECT on tables (not in the spec's matrix explicitly) so a ticket can show
-- its table name/number; kitchen never sees floor-plan editing (no write policy for kitchen).

create policy floors_select_staff on floors
  for select to authenticated
  using (is_staff(outlet_id));

create policy floors_write_admin_manager on floors
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy tables_select_staff on tables
  for select to authenticated
  using (is_staff(outlet_id));

create policy tables_select_customer on tables
  for select to authenticated
  using (is_customer() and id in (select table_id from table_sessions where id = customer_session_id()));

create policy tables_write_admin_manager on tables
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ table_sessions ============
-- Direct writes limited to super_admin/manager; claim/transfer/close go through RPC functions.

create policy table_sessions_select_staff on table_sessions
  for select to authenticated
  using (is_staff(outlet_id));

create policy table_sessions_select_customer on table_sessions
  for select to authenticated
  using (is_customer() and id = customer_session_id());

create policy table_sessions_write_admin_manager on table_sessions
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ table_session_customers ============
-- Written by resolve_qr()/join-session RPC (SECURITY DEFINER); readable by staff of the outlet and
-- by the customers already bound to that session (so the cart UI can show "3 people joined").

create policy table_session_customers_select_staff on table_session_customers
  for select to authenticated
  using (
    exists (
      select 1 from table_sessions ts where ts.id = table_session_customers.session_id and is_staff(ts.outlet_id)
    )
  );

create policy table_session_customers_select_customer on table_session_customers
  for select to authenticated
  using (is_customer() and session_id = customer_session_id());

-- ============ menu: tax_groups / categories / menu_items / item_variants / addon_groups / addons ============

create policy tax_groups_select_staff on tax_groups
  for select to authenticated
  using (is_staff(outlet_id));

create policy tax_groups_write_admin_manager on tax_groups
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy categories_select_staff on categories
  for select to authenticated
  using (is_staff(outlet_id));

create policy categories_select_customer on categories
  for select to authenticated
  using (is_customer() and outlet_id = customer_outlet_id() and is_active);

create policy categories_write_admin_manager on categories
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy menu_items_select_staff on menu_items
  for select to authenticated
  using (is_staff(outlet_id));

create policy menu_items_select_customer on menu_items
  for select to authenticated
  using (is_customer() and outlet_id = customer_outlet_id() and is_active);

create policy menu_items_write_admin_manager on menu_items
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy item_variants_select on item_variants
  for select to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = item_variants.item_id
        and (is_staff(mi.outlet_id) or (is_customer() and mi.outlet_id = customer_outlet_id() and mi.is_active))
    )
  );

create policy item_variants_write_admin_manager on item_variants
  for all to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = item_variants.item_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from menu_items mi
      where mi.id = item_variants.item_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  );

create policy addon_groups_select on addon_groups
  for select to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = addon_groups.item_id
        and (is_staff(mi.outlet_id) or (is_customer() and mi.outlet_id = customer_outlet_id() and mi.is_active))
    )
  );

create policy addon_groups_write_admin_manager on addon_groups
  for all to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = addon_groups.item_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from menu_items mi
      where mi.id = addon_groups.item_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  );

create policy addons_select on addons
  for select to authenticated
  using (
    exists (
      select 1 from addon_groups ag
      join menu_items mi on mi.id = ag.item_id
      where ag.id = addons.group_id
        and (is_staff(mi.outlet_id) or (is_customer() and mi.outlet_id = customer_outlet_id() and mi.is_active))
    )
  );

create policy addons_write_admin_manager on addons
  for all to authenticated
  using (
    exists (
      select 1 from addon_groups ag
      join menu_items mi on mi.id = ag.item_id
      where ag.id = addons.group_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from addon_groups ag
      join menu_items mi on mi.id = ag.item_id
      where ag.id = addons.group_id and is_staff(mi.outlet_id) and auth_role() in ('super_admin', 'manager')
    )
  );

-- ============ customers ============

create policy customers_select_staff on customers
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager', 'cashier', 'waiter'));

create policy customers_write_admin_manager on customers
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ orders / order_items / order_item_addons / order_events ============
-- No direct INSERT/UPDATE policies for orders or order_items: they are only ever written through
-- SECURITY DEFINER RPCs (place_order, cancel_item, set_item_status, set_order_status), which bypass
-- RLS as the owning role and perform their own permission checks.

create policy orders_select_staff on orders
  for select to authenticated
  using (is_staff(outlet_id));

create policy orders_select_customer on orders
  for select to authenticated
  using (is_customer() and session_id = customer_session_id());

create policy order_items_select_staff on order_items
  for select to authenticated
  using (is_staff(outlet_id));

create policy order_items_select_customer on order_items
  for select to authenticated
  using (
    is_customer() and exists (
      select 1 from orders o where o.id = order_items.order_id and o.session_id = customer_session_id()
    )
  );

create policy order_item_addons_select on order_item_addons
  for select to authenticated
  using (
    exists (
      select 1 from order_items oi
      where oi.id = order_item_addons.order_item_id
        and (
          is_staff(oi.outlet_id)
          or (is_customer() and exists (
            select 1 from orders o where o.id = oi.order_id and o.session_id = customer_session_id()
          ))
        )
    )
  );

create policy order_events_select_staff on order_events
  for select to authenticated
  using (is_staff(outlet_id));

-- ============ bill_counters ============
-- Internal to create_bill()/mark_paid(); no client access at all.

-- ============ bills / payments / whatsapp_messages ============
-- Direct writes go through create_bill / add_payment / mark_paid / void_bill RPCs only.

create policy bills_select_staff on bills
  for select to authenticated
  using (
    is_staff(outlet_id) and (
      auth_role() in ('super_admin', 'manager', 'cashier')
      or (auth_role() = 'waiter' and exists (
        select 1 from table_sessions ts where ts.id = bills.session_id and ts.waiter_id = auth_profile_id()
      ))
    )
  );

create policy bills_select_customer on bills
  for select to authenticated
  using (is_customer() and session_id = customer_session_id());

create policy payments_select_staff on payments
  for select to authenticated
  using (
    is_staff(outlet_id) and (
      auth_role() in ('super_admin', 'manager', 'cashier')
      or (auth_role() = 'waiter' and exists (
        select 1 from bills b
        join table_sessions ts on ts.id = b.session_id
        where b.id = payments.bill_id and ts.waiter_id = auth_profile_id()
      ))
    )
  );

create policy whatsapp_messages_select_admin_manager on whatsapp_messages
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ bookings ============

create policy bookings_select_staff on bookings
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager', 'cashier', 'waiter'));

create policy bookings_write_admin_manager on bookings
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ attendance ============

create policy attendance_select_self on attendance
  for select to authenticated
  using (user_id = auth_profile_id());

create policy attendance_select_admin_manager on attendance
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

create policy attendance_write_self on attendance
  for all to authenticated
  using (user_id = auth_profile_id())
  with check (user_id = auth_profile_id());

-- ============ audit_logs ============
-- Written exclusively by triggers/RPCs (SECURITY DEFINER, bypass RLS); no insert/update/delete
-- policy is ever granted, so audit rows are immutable from every client's perspective.

create policy audit_logs_select_admin_manager on audit_logs
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ daily_sales_summary ============
-- Filled by a nightly pg_cron job (runs as postgres, bypasses RLS).

create policy daily_sales_summary_select_admin_manager on daily_sales_summary
  for select to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- ============ notifications ============
-- Written exclusively by RPC functions/triggers (SECURITY DEFINER); staff read their own targeted
-- alerts plus outlet-wide broadcasts (target_user_id is null), and can acknowledge (stop the sound).

create policy notifications_select_staff on notifications
  for select to authenticated
  using (is_staff(outlet_id) and (target_user_id is null or target_user_id = auth_profile_id() or auth_role() in ('super_admin', 'manager')));

create policy notifications_acknowledge on notifications
  for update to authenticated
  using (is_staff(outlet_id) and (target_user_id is null or target_user_id = auth_profile_id()))
  with check (is_staff(outlet_id) and (target_user_id is null or target_user_id = auth_profile_id()));
