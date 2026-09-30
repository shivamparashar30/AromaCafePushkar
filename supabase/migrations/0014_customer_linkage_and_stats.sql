-- Customer spend tracking, end to end.
--
-- Flow this supports: customer scans a table QR -> places an order and must give
-- name + phone -> the phone identifies the customer record -> every paid bill on
-- that session rolls up into customers.total_spend / customers.visits, no matter
-- which table they sat at or how many sessions they had.
--
-- The counters used to be incremented by hand inside mark_paid(), which meant a
-- voided bill, a re-opened bill or a session whose phone was filled in later all
-- left customers.total_spend wrong. They are now DERIVED from bills + sessions and
-- recomputed by trigger, so they are self-healing.

-- ---------------------------------------------------------------------------
-- 1. Schema catch-up
-- ---------------------------------------------------------------------------

-- These two columns were added directly on the remote project and never captured
-- in a migration; 0010's RPCs already depend on them.
alter table table_sessions add column if not exists customer_name text;
alter table table_sessions add column if not exists customer_phone text;

create index if not exists idx_table_sessions_customer_phone
  on table_sessions(outlet_id, customer_phone)
  where customer_phone is not null;

create index if not exists idx_bills_customer on bills(customer_id);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Phones are matched on their trimmed value, which is what (outlet_id, phone) is
-- unique on. No digit-stripping: that would silently merge distinct existing rows.
create or replace function clean_phone(p_phone text)
returns text
language sql immutable
as $$ select nullif(trim(coalesce(p_phone, '')), '') $$;

comment on function clean_phone(text) is
  'Trimmed phone, or null when blank. The canonical form for customers.phone lookups.';

-- Creates the customer on first sight and refreshes the name on later visits, so
-- "same number, new spelling" updates the existing record instead of forking it.
create or replace function upsert_customer_by_phone(
  p_outlet_id uuid,
  p_phone text,
  p_name text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text := clean_phone(p_phone);
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_id    uuid;
begin
  if p_outlet_id is null or v_phone is null then
    return null;
  end if;

  insert into customers (outlet_id, phone, name)
  values (p_outlet_id, v_phone, v_name)
  on conflict (outlet_id, phone) do update
    set name = coalesce(nullif(trim(coalesce(excluded.name, '')), ''), customers.name),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- visits  = distinct sessions this phone was seen on (plus any session billed to them)
-- total_spend = sum of their paid bills
create or replace function recalc_customer_stats(p_customer_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_outlet uuid;
  v_phone  text;
begin
  if p_customer_id is null then return; end if;

  select outlet_id, phone into v_outlet, v_phone from customers where id = p_customer_id;
  if not found then return; end if;

  update customers set
    total_spend = coalesce((
      select sum(b.total)
      from bills b
      where b.customer_id = p_customer_id and b.status = 'paid'
    ), 0),
    visits = (
      select count(*) from (
        select ts.id
          from table_sessions ts
          where ts.outlet_id = v_outlet and clean_phone(ts.customer_phone) = v_phone
        union
        select b.session_id from bills b where b.customer_id = p_customer_id
      ) s
    ),
    updated_at = now()
  where id = p_customer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers that keep the link and the counters honest
-- ---------------------------------------------------------------------------

create or replace function bills_recalc_customer()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_customer_stats(old.customer_id);
    return old;
  end if;

  -- A bill moved from one customer to another: both sides need recomputing.
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform recalc_customer_stats(old.customer_id);
  end if;

  perform recalc_customer_stats(new.customer_id);
  return new;
end;
$$;

drop trigger if exists trg_bills_customer_stats on bills;
create trigger trg_bills_customer_stats
  after insert or delete or update of customer_id, status, total on bills
  for each row execute function bills_recalc_customer();

-- Whenever a session gains (or corrects) a phone — from the QR order flow or from
-- staff editing it — create/refresh the customer and point that session's bills at
-- them. This is what makes the linkage hold regardless of which code path set it.
create or replace function table_sessions_link_customer()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := upsert_customer_by_phone(new.outlet_id, new.customer_phone, new.customer_name);
  if v_customer_id is null then
    return new;
  end if;

  update bills
    set customer_id = v_customer_id
    where session_id = new.id and customer_id is distinct from v_customer_id;

  perform recalc_customer_stats(v_customer_id);
  return new;
end;
$$;

drop trigger if exists trg_table_sessions_customer_link on table_sessions;
create trigger trg_table_sessions_customer_link
  after insert or update of customer_phone, customer_name on table_sessions
  for each row
  when (clean_phone(new.customer_phone) is not null)
  execute function table_sessions_link_customer();

-- ---------------------------------------------------------------------------
-- 4. create_bill: stamp customer_id from the session
-- ---------------------------------------------------------------------------

create or replace function create_bill(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
  v_bill bills%rowtype;
  v_totals record;
  v_customer_id uuid;
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then raise exception 'Table session not open'; end if;
  if not is_staff(v_session.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() = 'kitchen' then raise exception 'Not permitted to bill'; end if;
  if auth_role() = 'waiter' and v_session.waiter_id is distinct from auth_profile_id() then
    raise exception 'This table is not assigned to you';
  end if;

  v_customer_id := upsert_customer_by_phone(
    v_session.outlet_id, v_session.customer_phone, v_session.customer_name
  );

  select * into v_bill from bills where session_id = p_session_id and status = 'open';
  if found then
    select * into v_totals from compute_bill_totals(p_session_id, v_bill.discount);
    update bills set subtotal = v_totals.subtotal, tax_total = v_totals.tax_total,
           service_charge = v_totals.service_charge, round_off = v_totals.round_off,
           total = v_totals.total, customer_id = coalesce(v_customer_id, customer_id)
      where id = v_bill.id
      returning * into v_bill;
    return to_jsonb(v_bill);
  end if;

  select * into v_totals from compute_bill_totals(p_session_id, 0);

  insert into bills (outlet_id, session_id, customer_id, subtotal, discount, service_charge,
                     tax_total, round_off, total, status)
  values (v_session.outlet_id, p_session_id, v_customer_id, v_totals.subtotal, 0,
          v_totals.service_charge, v_totals.tax_total, v_totals.round_off, v_totals.total, 'open')
  returning * into v_bill;

  update tables set status = 'bill_requested' where id = v_session.table_id;

  return to_jsonb(v_bill);
end;
$$;

grant execute on function create_bill(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. mark_paid: drop the hand-rolled total_spend increment
-- ---------------------------------------------------------------------------

create or replace function mark_paid(p_bill_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_paid bigint;
  v_bill_no text;
  v_table_id uuid;
  v_session table_sessions%rowtype;
  v_customer_id uuid;
begin
  select * into v_bill from bills where id = p_bill_id and status = 'open' for update;
  if not found then raise exception 'Open bill not found'; end if;
  if not is_staff(v_bill.outlet_id) then raise exception 'Not your outlet'; end if;
  if not (has_permission('bill_mark_paid') or auth_role() in ('super_admin', 'manager', 'cashier')) then
    raise exception 'Not permitted to mark bills paid';
  end if;
  if auth_role() = 'waiter' and not exists (
    select 1 from table_sessions ts where ts.id = v_bill.session_id and ts.waiter_id = auth_profile_id()
  ) then
    raise exception 'This table is not assigned to you';
  end if;

  select coalesce(sum(amount), 0) into v_paid from payments where bill_id = p_bill_id and status = 'confirmed';
  if v_paid <> v_bill.total then
    raise exception 'Paid amount (%) does not match bill total (%)', v_paid, v_bill.total;
  end if;

  v_bill_no := allocate_bill_number(v_bill.outlet_id);

  select * into v_session from table_sessions where id = v_bill.session_id;

  -- Last chance to attach the customer, in case the phone landed on the session
  -- after the bill was opened.
  v_customer_id := upsert_customer_by_phone(
    v_bill.outlet_id, v_session.customer_phone, v_session.customer_name
  );

  -- total_spend / visits are recomputed by trg_bills_customer_stats off this update.
  update bills
    set status = 'paid',
        bill_no = v_bill_no,
        customer_id = coalesce(v_customer_id, customer_id)
    where id = p_bill_id
    returning * into v_bill;

  v_table_id := v_session.table_id;
  update table_sessions set status = 'closed', closed_at = now() where id = v_bill.session_id;
  update tables set status = 'free' where id = v_table_id;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_bill.outlet_id, auth_profile_id(), 'mark_paid', 'bills', v_bill.id, null,
          jsonb_build_object('bill_no', v_bill_no, 'total', v_bill.total));

  return to_jsonb(v_bill);
end;
$$;

grant execute on function mark_paid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. customer_place_order: name AND phone are now required
-- ---------------------------------------------------------------------------

-- A stale overload with the same argument NAMES but a different order was sitting
-- alongside this one on the remote project, which left PostgREST unable to resolve
-- rpc('customer_place_order', {...}):
--   "Could not choose the best candidate function between: ..."
-- Its body was the pre-0013 version (customer name set only once, visits bumped on
-- every order) and is fully superseded by the definition below.
drop function if exists public.customer_place_order(uuid, jsonb, text, text);

create or replace function customer_place_order(
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_session table_sessions%rowtype;
  v_order orders%rowtype;
  v_kot_number int;
  v_item jsonb;
  v_menu_item menu_items%rowtype;
  v_variant item_variants%rowtype;
  v_unit_price bigint;
  v_order_item_id uuid;
  v_addon_id_text text;
  v_addon_row addons%rowtype;
  v_is_new_session boolean := false;
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone text := clean_phone(p_customer_phone);
begin
  if v_name is null then raise exception 'Your name is required'; end if;
  if v_phone is null then raise exception 'Your mobile number is required'; end if;

  select * into v_table from tables where id = p_table_id and is_active;
  if not found then raise exception 'Table not found'; end if;

  -- Find or join the table's open session.
  select * into v_session from table_sessions where table_id = p_table_id and status = 'open';
  if not found then
    -- The insert fires trg_table_sessions_customer_link, which creates/updates the
    -- customer record for this phone.
    insert into table_sessions (outlet_id, table_id, customer_name, customer_phone)
    values (v_table.outlet_id, p_table_id, v_name, v_phone)
    returning * into v_session;

    update tables set status = 'occupied' where id = p_table_id;
    v_is_new_session := true;
  else
    -- Joining an existing session: keep the latest name/phone, which also re-runs
    -- the link trigger and repoints the open bill if the phone changed.
    update table_sessions
      set customer_name = v_name, customer_phone = v_phone
      where id = v_session.id
      returning * into v_session;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in order';
  end if;

  select coalesce(max(kot_number), 0) + 1 into v_kot_number from orders where session_id = v_session.id;

  insert into orders (outlet_id, session_id, source, placed_by, placed_by_name, status, kot_number)
  values (v_session.outlet_id, v_session.id, 'customer', null, v_name, 'placed', v_kot_number)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu_item from menu_items
      where id = (v_item->>'item_id')::uuid
        and outlet_id = v_session.outlet_id
        and is_active and in_stock;
    if not found then
      raise exception 'Item % is unavailable', (v_item->>'item_id');
    end if;

    v_variant := null;
    v_unit_price := v_menu_item.price;
    if (v_item ? 'variant_id') and (v_item->>'variant_id') is not null then
      select * into v_variant from item_variants
        where id = (v_item->>'variant_id')::uuid and item_id = v_menu_item.id and is_active;
      if not found then
        raise exception 'Variant % is unavailable', (v_item->>'variant_id');
      end if;
      v_unit_price := v_variant.price;
    end if;

    insert into order_items (outlet_id, order_id, item_id, variant_id, qty, unit_price, notes, status, station)
    values (
      v_session.outlet_id, v_order.id, v_menu_item.id, v_variant.id,
      greatest(coalesce((v_item->>'qty')::int, 1), 1), v_unit_price, v_item->>'notes', 'ordered', v_menu_item.station
    )
    returning id into v_order_item_id;

    insert into order_events (outlet_id, order_id, order_item_id, from_status, to_status, actor_id)
    values (v_session.outlet_id, v_order.id, v_order_item_id, null, 'ordered', null);

    if v_item ? 'addon_ids' then
      for v_addon_id_text in select jsonb_array_elements_text(v_item->'addon_ids') loop
        select a.* into v_addon_row
        from addons a
        join addon_groups ag on ag.id = a.group_id
        where a.id = v_addon_id_text::uuid and ag.item_id = v_menu_item.id and a.is_active;
        if not found then
          raise exception 'Addon % is unavailable', v_addon_id_text;
        end if;
        insert into order_item_addons (order_item_id, addon_id, price)
        values (v_order_item_id, v_addon_row.id, v_addon_row.price);
      end loop;
    end if;
  end loop;

  if v_is_new_session then
    insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
    values (v_session.outlet_id, 'new_unassigned_table', v_session.table_id, v_session.id, null,
            jsonb_build_object('order_id', v_order.id, 'customer_name', v_name));
  end if;

  return jsonb_build_object('order_id', v_order.id, 'kot_number', v_order.kot_number, 'session_id', v_session.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Backfill history
-- ---------------------------------------------------------------------------

-- Create customers for any past session that carried a phone but never got one.
do $$
declare
  r record;
begin
  for r in
    select outlet_id, clean_phone(customer_phone) as phone,
           (array_agg(customer_name order by created_at desc))[1] as name
    from table_sessions
    where clean_phone(customer_phone) is not null
    group by outlet_id, clean_phone(customer_phone)
  loop
    perform upsert_customer_by_phone(r.outlet_id, r.phone, r.name);
  end loop;
end $$;

-- Point every existing bill at the customer behind its session.
update bills b
set customer_id = c.id
from table_sessions ts
join customers c
  on c.outlet_id = ts.outlet_id
 and c.phone = clean_phone(ts.customer_phone)
where ts.id = b.session_id
  and b.customer_id is distinct from c.id;

-- Recompute every customer from scratch, healing any drift left by the old
-- increment-in-mark_paid approach.
do $$
declare
  r record;
begin
  for r in select id from customers loop
    perform recalc_customer_stats(r.id);
  end loop;
end $$;

-- Let PostgREST pick up the new signature set.
notify pgrst, 'reload schema';
