-- Counter / takeaway bills: someone walks up and orders without ever sitting at a table.
--
-- A bill needs a session and a session needs a table (table_sessions.table_id is NOT NULL
-- and much of the system joins through it), so rather than making that nullable and
-- teaching every query about it, counter sales get real tables on a dedicated "Counter"
-- floor. They then reuse everything already built: KOT routing by station, sequential
-- bill numbering, payments, reports, and the live-orders bill panel.
--
-- Counter slots are provisioned on demand, so two walk-ins at once do not collide with
-- uq_one_open_session_per_table -- the first takes Counter 1, the second gets Counter 2
-- created for it.

alter table tables add column if not exists is_counter boolean not null default false;

-- A counter bill is a till transaction and never reaches the kitchen. Items are still
-- created through place_order (identical validation, pricing, variants and add-ons) and
-- then marked served immediately, which is what keeps them off the kitchen display --
-- the KDS filters on order status, so a served order never appears there.
create or replace function create_walkin_bill(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_outlet uuid;
  v_floor uuid;
  v_table tables%rowtype;
  v_session table_sessions%rowtype;
  v_next int;
  v_bill jsonb;
  v_items uuid[];
begin
  if auth_role() not in ('super_admin', 'manager', 'cashier') then
    raise exception 'Only a manager, admin or cashier can raise a counter bill.';
  end if;
  if not has_permission('orders_place') then
    raise exception 'Not permitted to place orders';
  end if;

  select outlet_id into v_outlet from profiles where id = auth_profile_id();
  if v_outlet is null then raise exception 'No outlet for this user'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the counter bill.';
  end if;

  -- The Counter floor holds every counter slot and is created once, lazily.
  select id into v_floor from floors
    where outlet_id = v_outlet and name = 'Counter' limit 1;
  if v_floor is null then
    insert into floors (outlet_id, name, sort_order)
    values (v_outlet, 'Counter', 999)
    returning id into v_floor;
  end if;

  -- Claim a free counter slot. SKIP LOCKED so two concurrent walk-ins take different
  -- slots instead of one blocking or failing on the one-open-session-per-table index.
  select t.* into v_table
  from tables t
  where t.outlet_id = v_outlet
    and t.is_counter
    and t.is_active
    and not exists (
      select 1 from table_sessions ts
      where ts.table_id = t.id and ts.status = 'open'
    )
  order by t.name
  for update of t skip locked
  limit 1;

  if not found then
    select coalesce(count(*), 0) + 1 into v_next
    from tables where outlet_id = v_outlet and is_counter;

    -- gen_random_uuid() is core; gen_random_bytes lives in pgcrypto, which is not on
    -- this function's search_path.
    insert into tables (outlet_id, floor_id, name, capacity, is_counter, qr_token, status)
    values (v_outlet, v_floor, 'Counter ' || v_next, 1, true,
            replace(gen_random_uuid()::text, '-', ''), 'free')
    returning * into v_table;
  end if;

  insert into table_sessions (outlet_id, table_id, waiter_id, customer_name, customer_phone)
  values (v_outlet, v_table.id, auth_profile_id(),
          nullif(trim(coalesce(p_customer_name, '')), ''), clean_phone(p_customer_phone))
  returning * into v_session;

  update tables set status = 'occupied' where id = v_table.id;

  -- Reuse the normal paths so item validation, KOT numbering, station routing and bill
  -- totals behave exactly as they do for a seated table.
  perform place_order(v_session.id, p_items);

  -- Straight to served: nothing to cook, so the kitchen never sees it.
  select array_agg(oi.id) into v_items
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.session_id = v_session.id and oi.status <> 'cancelled';

  if v_items is not null then
    perform apply_item_status(v_items, 'served'::order_item_status, auth_profile_id());
  end if;

  v_bill := create_bill(v_session.id);

  return jsonb_build_object(
    'bill_id', v_bill->>'id',
    'session_id', v_session.id,
    'table_id', v_table.id,
    'table_name', v_table.name,
    'total', (v_bill->>'total')::bigint
  );
end;
$$;

grant execute on function create_walkin_bill(jsonb, text, text) to authenticated;

-- Keep exactly one signature so PostgREST cannot hit the "could not choose the best
-- candidate function" ambiguity that customer_place_order did.
drop function if exists public.create_walkin_bill(jsonb, text, text, boolean);

-- Attach (or correct) the customer on a session. Writing table_sessions directly is
-- restricted to super_admin/manager by RLS, which would leave a cashier unable to put a
-- phone on a counter sale, so this goes through a definer RPC instead.
--
-- Setting customer_phone fires trg_table_sessions_customer_link, which creates or
-- refreshes the customer record and repoints that session's bills at them -- so counter
-- sales roll into total_spend exactly like table sales.
create or replace function set_session_customer(
  p_session_id uuid,
  p_name text,
  p_phone text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
begin
  select * into v_session from table_sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
  if not is_staff(v_session.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() = 'kitchen' then
    raise exception 'Not permitted to edit customer details';
  end if;

  update table_sessions
    set customer_name  = coalesce(nullif(trim(coalesce(p_name, '')), ''), customer_name),
        customer_phone = coalesce(clean_phone(p_phone), customer_phone)
    where id = p_session_id;
end;
$$;

grant execute on function set_session_customer(uuid, text, text) to authenticated;
