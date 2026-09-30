-- RPC functions for every multi-step / atomic action, per the spec's "Data access, functions and
-- realtime" section. Public entry points are SECURITY DEFINER (owned by the migration role, which
-- has BYPASSRLS in Supabase) and do their OWN role/permission checks inline; internal helpers are
-- explicitly revoked from authenticated/anon so they can't be called directly as RPCs, only from
-- within the entry points above them (which execute as the owning role).

-- ===================== small helpers =====================

create or replace function financial_year_label(p_date date default current_date)
returns text
language plpgsql
stable
as $$
declare
  v_year int;
begin
  v_year := extract(year from p_date)::int;
  if extract(month from p_date)::int < 4 then
    v_year := v_year - 1;
  end if;
  return v_year::text || '-' || lpad(((v_year + 1) % 100)::text, 2, '0');
end;
$$;

create or replace function hash_pin(p_pin text)
returns text
language sql
as $$
  select crypt(p_pin, gen_salt('bf'));
$$;

create or replace function verify_pin(p_hash text, p_pin text)
returns boolean
language sql
as $$
  select p_hash = crypt(p_pin, p_hash);
$$;

revoke execute on function hash_pin(text) from public, anon, authenticated;
revoke execute on function verify_pin(text, text) from public, anon, authenticated;
grant execute on function hash_pin(text) to service_role;
grant execute on function verify_pin(text, text) to service_role;

-- ===================== order status derivation =====================

create or replace function recompute_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_total int;
  v_cancelled int;
  v_cooking int;
  v_ready int;
  v_served int;
  v_status order_status;
begin
  select count(*), count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'cooking'),
         count(*) filter (where status = 'ready'),
         count(*) filter (where status = 'served')
    into v_total, v_cancelled, v_cooking, v_ready, v_served
  from order_items where order_id = p_order_id;

  if v_total = 0 then
    return;
  elsif v_total = v_cancelled then
    v_status := 'cancelled';
  elsif v_served + v_cancelled = v_total then
    v_status := 'served';
  elsif v_ready + v_served + v_cancelled = v_total then
    v_status := 'ready';
  elsif v_cooking > 0 or v_ready > 0 or v_served > 0 then
    v_status := 'cooking';
  else
    v_status := 'placed';
  end if;

  update orders set status = v_status where id = p_order_id and status is distinct from v_status;
end;
$$;

revoke execute on function recompute_order_status(uuid) from public, anon, authenticated;

-- ===================== notifications =====================

create or replace function create_notification_for_order(p_order_id uuid, p_event notification_event)
returns void
language plpgsql
as $$
declare
  v_order orders%rowtype;
  v_session table_sessions%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  select * into v_session from table_sessions where id = v_order.session_id;

  insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
  values (v_order.outlet_id, p_event, v_session.table_id, v_session.id, v_session.waiter_id,
          jsonb_build_object('order_id', p_order_id, 'kot_number', v_order.kot_number));
end;
$$;

revoke execute on function create_notification_for_order(uuid, notification_event) from public, anon, authenticated;

create or replace function call_waiter(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then raise exception 'Table session not open'; end if;
  if is_customer() and not exists (
    select 1 from table_session_customers where session_id = p_session_id and customer_auth_id = auth.uid()
  ) then
    raise exception 'Not a member of this table session';
  end if;

  insert into notifications (outlet_id, event, table_id, session_id, target_user_id)
  values (v_session.outlet_id, 'call_waiter', v_session.table_id, v_session.id, v_session.waiter_id);
end;
$$;

grant execute on function call_waiter(uuid) to authenticated;

create or replace function request_bill(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then raise exception 'Table session not open'; end if;
  if is_customer() and not exists (
    select 1 from table_session_customers where session_id = p_session_id and customer_auth_id = auth.uid()
  ) then
    raise exception 'Not a member of this table session';
  end if;

  update tables set status = 'bill_requested' where id = v_session.table_id;

  insert into notifications (outlet_id, event, table_id, session_id, target_user_id)
  values (v_session.outlet_id, 'bill_requested', v_session.table_id, v_session.id, v_session.waiter_id);
end;
$$;

grant execute on function request_bill(uuid) to authenticated;

-- ===================== resolve_qr =====================

create or replace function resolve_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_outlet outlets%rowtype;
  v_ordering jsonb;
  v_session table_sessions%rowtype;
  v_customer_id uuid := auth.uid();
  v_menu jsonb;
begin
  if v_customer_id is null then
    raise exception 'resolve_qr requires an authenticated (anonymous) session';
  end if;

  select * into v_table from tables where qr_token = p_token and is_active = true;
  if not found then
    raise exception 'Invalid or inactive QR code';
  end if;

  select * into v_outlet from outlets where id = v_table.outlet_id;

  v_ordering := coalesce(v_outlet.settings->'ordering', '{}'::jsonb) || coalesce(v_table.ordering_override, '{}'::jsonb);

  if coalesce((v_ordering->>'user_ordering')::boolean, true) then
    select * into v_session from table_sessions where table_id = v_table.id and status = 'open';
    if not found then
      insert into table_sessions (outlet_id, table_id, requires_order_confirmation)
      values (v_table.outlet_id, v_table.id, coalesce((v_ordering->>'first_order_needs_confirmation')::boolean, false))
      returning * into v_session;

      update tables set status = 'occupied' where id = v_table.id and status = 'free';
    end if;

    insert into table_session_customers (session_id, customer_auth_id)
    values (v_session.id, v_customer_id)
    on conflict (session_id, customer_auth_id) do nothing;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'name', c.name, 'image_url', c.image_url, 'sort_order', c.sort_order,
      'items', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', mi.id, 'name', mi.name, 'description', mi.description, 'price', mi.price,
            'image_urls', mi.image_urls, 'food_type', mi.food_type, 'tags', mi.tags, 'in_stock', mi.in_stock,
            'variants', (
              select coalesce(jsonb_agg(jsonb_build_object('id', iv.id, 'name', iv.name, 'price', iv.price) order by iv.sort_order), '[]'::jsonb)
              from item_variants iv where iv.item_id = mi.id and iv.is_active
            ),
            'addon_groups', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', ag.id, 'name', ag.name, 'min', ag.min_select, 'max', ag.max_select,
                'addons', (
                  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'price', a.price)), '[]'::jsonb)
                  from addons a where a.group_id = ag.id and a.is_active
                )
              ) order by ag.sort_order), '[]'::jsonb)
              from addon_groups ag where ag.item_id = mi.id
            )
          ) order by mi.sort_order
        ), '[]'::jsonb)
        from menu_items mi
        where mi.category_id = c.id and mi.is_active
      )
    ) order by c.sort_order
  ) into v_menu
  from categories c
  where c.outlet_id = v_table.outlet_id and c.is_active
    and (c.available_from is null or c.available_to is null or current_time between c.available_from and c.available_to);

  return jsonb_build_object(
    'table', jsonb_build_object('id', v_table.id, 'name', v_table.name, 'status', v_table.status),
    'outlet', jsonb_build_object('id', v_outlet.id, 'name', v_outlet.name, 'logo_url', v_outlet.logo_url),
    'ordering', v_ordering,
    'session_id', v_session.id,
    'menu', coalesce(v_menu, '[]'::jsonb)
  );
end;
$$;

grant execute on function resolve_qr(text) to authenticated;

-- ===================== place_order =====================

create or replace function place_order(p_session_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
  v_source order_source;
  v_placed_by uuid;
  v_order orders%rowtype;
  v_kot_number int;
  v_item jsonb;
  v_menu_item menu_items%rowtype;
  v_variant item_variants%rowtype;
  v_unit_price bigint;
  v_order_item_id uuid;
  v_addon_id_text text;
  v_addon_row addons%rowtype;
  v_was_unassigned boolean;
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then
    raise exception 'Table session not open';
  end if;
  v_was_unassigned := v_session.waiter_id is null;

  if is_customer() then
    if not exists (
      select 1 from table_session_customers where session_id = p_session_id and customer_auth_id = auth.uid()
    ) then
      raise exception 'Not a member of this table session';
    end if;
    v_source := 'customer';
    v_placed_by := null;
  elsif auth_role() = 'waiter' then
    if not has_permission('orders_place') then
      raise exception 'Not permitted to place orders';
    end if;
    if v_session.waiter_id is distinct from auth_profile_id() then
      raise exception 'This table is not assigned to you';
    end if;
    v_source := 'waiter';
    v_placed_by := auth_profile_id();
  elsif auth_role() in ('super_admin', 'manager', 'cashier') then
    if not has_permission('orders_place') then
      raise exception 'Not permitted to place orders';
    end if;
    v_source := 'admin';
    v_placed_by := auth_profile_id();
  else
    raise exception 'Not permitted to place orders';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in order';
  end if;

  select coalesce(max(kot_number), 0) + 1 into v_kot_number from orders where session_id = p_session_id;

  insert into orders (outlet_id, session_id, source, placed_by, status, kot_number)
  values (v_session.outlet_id, p_session_id, v_source, v_placed_by, 'placed', v_kot_number)
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
    values (v_session.outlet_id, v_order.id, v_order_item_id, null, 'ordered', v_placed_by);

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

  if v_source = 'customer' and v_was_unassigned then
    insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
    values (v_session.outlet_id, 'new_unassigned_table', v_session.table_id, v_session.id, null,
            jsonb_build_object('order_id', v_order.id));
  end if;

  return jsonb_build_object('order_id', v_order.id, 'kot_number', v_order.kot_number);
end;
$$;

grant execute on function place_order(uuid, jsonb) to authenticated;

-- ===================== claim_table / assign_waiter / transfer_table =====================

create or replace function claim_table(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_session table_sessions%rowtype;
  v_profile_id uuid := auth_profile_id();
begin
  if auth_role() not in ('waiter', 'super_admin', 'manager') then
    raise exception 'Only waiters or managers can claim a table';
  end if;

  select * into v_table from tables where id = p_table_id and is_active;
  if not found then raise exception 'Table not found'; end if;
  if not is_staff(v_table.outlet_id) then raise exception 'Not your outlet'; end if;

  select * into v_session from table_sessions where table_id = p_table_id and status = 'open';
  if not found then
    insert into table_sessions (outlet_id, table_id, waiter_id)
    values (v_table.outlet_id, p_table_id, v_profile_id)
    returning * into v_session;
    update tables set status = 'occupied' where id = p_table_id;
    return jsonb_build_object('session_id', v_session.id, 'claimed', true);
  end if;

  if v_session.waiter_id is null then
    update table_sessions set waiter_id = v_profile_id where id = v_session.id;
    return jsonb_build_object('session_id', v_session.id, 'claimed', true);
  end if;

  if v_session.waiter_id = v_profile_id then
    return jsonb_build_object('session_id', v_session.id, 'claimed', true, 'already_yours', true);
  end if;

  raise exception 'Table % is assigned to another waiter; use transfer_table to request a transfer', v_table.name;
end;
$$;

grant execute on function claim_table(uuid) to authenticated;

create or replace function assign_waiter(p_table_id uuid, p_waiter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_session table_sessions%rowtype;
begin
  if auth_role() not in ('super_admin', 'manager') then
    raise exception 'Only admins or managers can assign waiters directly';
  end if;

  select * into v_table from tables where id = p_table_id;
  if not found then raise exception 'Table not found'; end if;
  if not is_staff(v_table.outlet_id) then raise exception 'Not your outlet'; end if;

  if p_waiter_id is not null and not exists (
    select 1 from profiles where id = p_waiter_id and outlet_id = v_table.outlet_id and is_active
  ) then
    raise exception 'Waiter not found in this outlet';
  end if;

  select * into v_session from table_sessions where table_id = p_table_id and status = 'open';
  if not found then
    insert into table_sessions (outlet_id, table_id, waiter_id)
    values (v_table.outlet_id, p_table_id, p_waiter_id)
    returning * into v_session;
    update tables set status = 'occupied' where id = p_table_id and status = 'free';
  else
    update table_sessions set waiter_id = p_waiter_id where id = v_session.id returning * into v_session;
  end if;

  return jsonb_build_object('session_id', v_session.id, 'waiter_id', v_session.waiter_id);
end;
$$;

grant execute on function assign_waiter(uuid, uuid) to authenticated;

create or replace function transfer_table(p_table_id uuid, p_to_waiter_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_session table_sessions%rowtype;
  v_outlet outlets%rowtype;
  v_caller uuid := auth_profile_id();
  v_target uuid := coalesce(p_to_waiter_id, v_caller);
  v_allow_direct boolean;
  v_old_waiter uuid;
begin
  select * into v_table from tables where id = p_table_id;
  if not found then raise exception 'Table not found'; end if;
  if not is_staff(v_table.outlet_id) then raise exception 'Not your outlet'; end if;

  select * into v_session from table_sessions where table_id = p_table_id and status = 'open';
  if not found then raise exception 'Table has no open session to transfer'; end if;
  v_old_waiter := v_session.waiter_id;

  select * into v_outlet from outlets where id = v_table.outlet_id;
  v_allow_direct := coalesce((v_outlet.settings->'ordering'->>'allow_direct_table_takeover')::boolean, false);

  if auth_role() in ('super_admin', 'manager') then
    null; -- admins/managers can always reassign
  elsif auth_role() = 'waiter' then
    if v_old_waiter = v_caller then
      raise exception 'You already hold this table';
    end if;
    if not (v_old_waiter is null or v_old_waiter = v_target or v_allow_direct) then
      raise exception 'Transfer needs approval from the current waiter or a manager (or enable direct takeover)';
    end if;
  else
    raise exception 'Not permitted to transfer tables';
  end if;

  update table_sessions set waiter_id = v_target where id = v_session.id;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_table.outlet_id, v_caller, 'transfer_table', 'table_sessions', v_session.id,
          jsonb_build_object('waiter_id', v_old_waiter), jsonb_build_object('waiter_id', v_target));

  return jsonb_build_object('session_id', v_session.id, 'waiter_id', v_target);
end;
$$;

grant execute on function transfer_table(uuid, uuid) to authenticated;

-- ===================== item / order status =====================

create or replace function apply_item_status(p_item_ids uuid[], p_status order_item_status, p_actor uuid)
returns void
language plpgsql
as $$
declare
  v_item order_items%rowtype;
  v_order_ids uuid[] := '{}';
  v_order_id uuid;
begin
  for v_item in select * from order_items where id = any(p_item_ids) for update loop
    if v_item.status = 'cancelled' then
      continue;
    end if;

    update order_items
      set status = p_status,
          cooked_at = case when p_status = 'cooking' and cooked_at is null then now() else cooked_at end,
          ready_at = case when p_status = 'ready' and ready_at is null then now() else ready_at end,
          served_at = case when p_status = 'served' and served_at is null then now() else served_at end
      where id = v_item.id;

    insert into order_events (outlet_id, order_id, order_item_id, from_status, to_status, actor_id)
    values (v_item.outlet_id, v_item.order_id, v_item.id, v_item.status::text, p_status::text, p_actor);

    if not (v_item.order_id = any(v_order_ids)) then
      v_order_ids := array_append(v_order_ids, v_item.order_id);
    end if;
  end loop;

  foreach v_order_id in array v_order_ids loop
    perform recompute_order_status(v_order_id);
    if exists (select 1 from orders where id = v_order_id and status = 'ready') then
      perform create_notification_for_order(v_order_id, 'order_ready');
    end if;
  end loop;
end;
$$;

revoke execute on function apply_item_status(uuid[], order_item_status, uuid) from public, anon, authenticated;

create or replace function set_item_status(p_item_ids uuid[], p_status order_item_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    (auth_role() = 'kitchen' and has_permission('item_status_update'))
    or auth_role() in ('super_admin', 'manager')
  ) then
    raise exception 'Not permitted to update item status';
  end if;

  if exists (select 1 from order_items oi where oi.id = any(p_item_ids) and not is_staff(oi.outlet_id)) then
    raise exception 'Not your outlet';
  end if;

  perform apply_item_status(p_item_ids, p_status, auth_profile_id());
end;
$$;

grant execute on function set_item_status(uuid[], order_item_status) to authenticated;

create or replace function set_order_status(p_order_id uuid, p_status order_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_status order_item_status;
  v_ids uuid[];
begin
  if p_status not in ('cooking', 'ready', 'served') then
    raise exception 'Unsupported target status';
  end if;
  v_item_status := p_status::text::order_item_status;

  if auth_role() = 'kitchen' then
    if not has_permission('item_status_update') then
      raise exception 'Not permitted';
    end if;
  elsif auth_role() = 'waiter' then
    if p_status <> 'served' then
      raise exception 'Waiters can only mark orders served (picked up)';
    end if;
    if not exists (
      select 1 from orders o join table_sessions ts on ts.id = o.session_id
      where o.id = p_order_id and ts.waiter_id = auth_profile_id()
    ) then
      raise exception 'This table is not assigned to you';
    end if;
  elsif auth_role() not in ('super_admin', 'manager') then
    raise exception 'Not permitted';
  end if;

  select array_agg(id) into v_ids from order_items where order_id = p_order_id and status <> 'cancelled';
  if v_ids is not null then
    perform apply_item_status(v_ids, v_item_status, auth_profile_id());
  end if;
end;
$$;

grant execute on function set_order_status(uuid, order_status) to authenticated;

-- ===================== cancel_item =====================

create or replace function cancel_item(p_item_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item order_items%rowtype;
  v_is_cooking_started boolean;
begin
  select * into v_item from order_items where id = p_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  if not is_staff(v_item.outlet_id) then raise exception 'Not your outlet'; end if;
  if v_item.status in ('served', 'cancelled') then
    raise exception 'Item already % and cannot be cancelled', v_item.status;
  end if;

  v_is_cooking_started := v_item.status in ('cooking', 'ready');

  if v_is_cooking_started then
    if auth_role() not in ('super_admin', 'manager') then
      raise exception 'Cancelling after cooking has started needs a manager or admin';
    end if;
    if auth_role() = 'manager' and (p_reason is null or length(trim(p_reason)) = 0) then
      raise exception 'A reason is required to cancel an item that has started cooking';
    end if;
  else
    if auth_role() = 'waiter' then
      if not exists (
        select 1 from orders o join table_sessions ts on ts.id = o.session_id
        where o.id = v_item.order_id and ts.waiter_id = auth_profile_id()
      ) then
        raise exception 'This table is not assigned to you';
      end if;
    elsif auth_role() not in ('super_admin', 'manager') then
      raise exception 'Not permitted to cancel items';
    end if;
  end if;

  update order_items
    set status = 'cancelled', cancel_reason = p_reason, cancelled_by = auth_profile_id(), cancelled_at = now()
    where id = p_item_id;

  insert into order_events (outlet_id, order_id, order_item_id, from_status, to_status, actor_id)
  values (v_item.outlet_id, v_item.order_id, v_item.id, v_item.status::text, 'cancelled', auth_profile_id());

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_item.outlet_id, auth_profile_id(), 'cancel_item', 'order_items', v_item.id,
          jsonb_build_object('status', v_item.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));

  insert into notifications (outlet_id, event, table_id, session_id, payload)
  select o.outlet_id, 'item_cancelled', ts.table_id, ts.id, jsonb_build_object('order_item_id', v_item.id, 'reason', p_reason)
  from orders o join table_sessions ts on ts.id = o.session_id
  where o.id = v_item.order_id;

  perform recompute_order_status(v_item.order_id);
end;
$$;

grant execute on function cancel_item(uuid, text) to authenticated;

-- ===================== billing =====================

create or replace function allocate_bill_number(p_outlet_id uuid)
returns text
language plpgsql
as $$
declare
  v_fy text := financial_year_label(current_date);
  v_next int;
  v_prefix text;
begin
  insert into bill_counters (outlet_id, financial_year, next_number)
  values (p_outlet_id, v_fy, 1)
  on conflict (outlet_id, financial_year) do nothing;

  update bill_counters
    set next_number = next_number + 1
    where outlet_id = p_outlet_id and financial_year = v_fy
    returning next_number - 1 into v_next;

  select coalesce(settings->>'bill_prefix', 'INV') into v_prefix from outlets where id = p_outlet_id;

  return v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 6, '0');
end;
$$;

revoke execute on function allocate_bill_number(uuid) from public, anon, authenticated;

-- Computes subtotal/tax/service charge/round-off/total for a session's still-open bill.
-- NOTE: tax is applied per line item's own tax_group, on that line's pro-rata share of the
-- discounted subtotal; service charge is applied to the discounted subtotal. Confirm this GST
-- treatment (inclusive/exclusive pricing, whether service charge is itself taxable) with your
-- accountant before going live -- the spec explicitly flags this as needing sign-off.

create or replace function compute_bill_totals(p_session_id uuid, p_discount bigint default 0)
returns table (subtotal bigint, tax_total bigint, service_charge bigint, round_off bigint, total bigint)
language plpgsql
as $$
declare
  v_outlet_id uuid;
  v_subtotal bigint := 0;
  v_service_on boolean;
  v_service_pct numeric;
  v_service bigint := 0;
  v_taxable_base bigint;
  v_tax bigint := 0;
  v_grand bigint;
  v_round bigint;
begin
  select outlet_id into v_outlet_id from table_sessions where id = p_session_id;

  select coalesce(sum(
           oi.unit_price * oi.qty
           + coalesce((select sum(oia.price) from order_item_addons oia where oia.order_item_id = oi.id), 0)
         ), 0)
    into v_subtotal
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.session_id = p_session_id and oi.status <> 'cancelled';

  select coalesce((settings->'service_charge'->>'enabled')::boolean, false),
         coalesce((settings->'service_charge'->>'percent')::numeric, 0)
    into v_service_on, v_service_pct
  from outlets where id = v_outlet_id;

  v_taxable_base := greatest(v_subtotal - coalesce(p_discount, 0), 0);

  if v_service_on then
    v_service := round(v_taxable_base * v_service_pct / 100.0);
  end if;

  if v_subtotal > 0 then
    select coalesce(sum(
             round(
               (lines.line_total - lines.line_total * coalesce(p_discount, 0)::numeric / v_subtotal)
               * (coalesce(tg.cgst_percent, 0) + coalesce(tg.sgst_percent, 0)) / 100.0
             )
           ), 0)
      into v_tax
    from (
      select oi.id,
             oi.unit_price * oi.qty
               + coalesce((select sum(oia.price) from order_item_addons oia where oia.order_item_id = oi.id), 0) as line_total,
             mi.tax_group_id
      from order_items oi
      join orders o on o.id = oi.order_id
      join menu_items mi on mi.id = oi.item_id
      where o.session_id = p_session_id and oi.status <> 'cancelled'
    ) lines
    left join tax_groups tg on tg.id = lines.tax_group_id;
  end if;

  v_grand := v_taxable_base + v_service + v_tax;
  v_round := (round(v_grand / 100.0) * 100) - v_grand;
  v_grand := v_grand + v_round;

  return query select v_subtotal, v_tax, v_service, v_round, v_grand;
end;
$$;

revoke execute on function compute_bill_totals(uuid, bigint) from public, anon, authenticated;

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
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then raise exception 'Table session not open'; end if;
  if not is_staff(v_session.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() = 'kitchen' then raise exception 'Not permitted to bill'; end if;
  if auth_role() = 'waiter' and v_session.waiter_id is distinct from auth_profile_id() then
    raise exception 'This table is not assigned to you';
  end if;

  select * into v_bill from bills where session_id = p_session_id and status = 'open';
  if found then
    select * into v_totals from compute_bill_totals(p_session_id, v_bill.discount);
    update bills set subtotal = v_totals.subtotal, tax_total = v_totals.tax_total,
           service_charge = v_totals.service_charge, round_off = v_totals.round_off, total = v_totals.total
      where id = v_bill.id
      returning * into v_bill;
    return to_jsonb(v_bill);
  end if;

  select * into v_totals from compute_bill_totals(p_session_id, 0);

  insert into bills (outlet_id, session_id, subtotal, discount, service_charge, tax_total, round_off, total, status)
  values (v_session.outlet_id, p_session_id, v_totals.subtotal, 0, v_totals.service_charge, v_totals.tax_total, v_totals.round_off, v_totals.total, 'open')
  returning * into v_bill;

  update tables set status = 'bill_requested' where id = v_session.table_id;

  return to_jsonb(v_bill);
end;
$$;

grant execute on function create_bill(uuid) to authenticated;

create or replace function apply_discount(p_bill_id uuid, p_discount bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_old_discount bigint;
  v_max_pct numeric;
  v_pct numeric;
  v_totals record;
begin
  select * into v_bill from bills where id = p_bill_id and status = 'open' for update;
  if not found then raise exception 'Open bill not found'; end if;
  if not is_staff(v_bill.outlet_id) then raise exception 'Not your outlet'; end if;
  if not has_permission('discount_apply') then raise exception 'Not permitted to apply discounts'; end if;
  v_old_discount := v_bill.discount;

  select r.max_discount_percent into v_max_pct
  from profiles p join roles r on r.id = p.role_id
  where p.id = auth_profile_id();

  if v_max_pct is not null then
    v_pct := case when v_bill.subtotal > 0 then (p_discount::numeric / v_bill.subtotal) * 100 else 0 end;
    if v_pct > v_max_pct then
      raise exception 'Discount exceeds your % percent limit', v_max_pct;
    end if;
  end if;

  select * into v_totals from compute_bill_totals(v_bill.session_id, p_discount);

  update bills set discount = p_discount, discount_reason = p_reason, discount_by = auth_profile_id(),
         subtotal = v_totals.subtotal, tax_total = v_totals.tax_total, service_charge = v_totals.service_charge,
         round_off = v_totals.round_off, total = v_totals.total
    where id = p_bill_id
    returning * into v_bill;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_bill.outlet_id, auth_profile_id(), 'apply_discount', 'bills', v_bill.id,
          jsonb_build_object('discount', v_old_discount), jsonb_build_object('discount', p_discount, 'reason', p_reason));

  return to_jsonb(v_bill);
end;
$$;

grant execute on function apply_discount(uuid, bigint, text) to authenticated;

create or replace function add_payment(p_bill_id uuid, p_mode payment_mode, p_amount bigint, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_payment payments%rowtype;
begin
  select * into v_bill from bills where id = p_bill_id and status = 'open' for update;
  if not found then raise exception 'Open bill not found'; end if;
  if not is_staff(v_bill.outlet_id) then raise exception 'Not your outlet'; end if;
  if not (has_permission('bill_mark_paid') or auth_role() in ('super_admin', 'manager', 'cashier')) then
    raise exception 'Not permitted to record payments';
  end if;
  if auth_role() = 'waiter' and not exists (
    select 1 from table_sessions ts where ts.id = v_bill.session_id and ts.waiter_id = auth_profile_id()
  ) then
    raise exception 'This table is not assigned to you';
  end if;

  insert into payments (outlet_id, bill_id, mode, amount, reference, marked_by, status)
  values (v_bill.outlet_id, p_bill_id, p_mode, p_amount, p_reference, auth_profile_id(), 'confirmed')
  returning * into v_payment;

  return to_jsonb(v_payment);
end;
$$;

grant execute on function add_payment(uuid, payment_mode, bigint, text) to authenticated;

create or replace function mark_paid(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_paid bigint;
  v_bill_no text;
  v_table_id uuid;
  v_customer_phone text;
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

  update bills set status = 'paid', bill_no = v_bill_no where id = p_bill_id returning * into v_bill;

  select table_id into v_table_id from table_sessions where id = v_bill.session_id;
  update table_sessions set status = 'closed', closed_at = now() where id = v_bill.session_id;
  update tables set status = 'free' where id = v_table_id;

  -- Update customer total_spend if session has a customer phone
  select customer_phone into v_customer_phone
  from table_sessions where id = v_bill.session_id;

  if v_customer_phone is not null and v_customer_phone <> '' then
    update customers
    set total_spend = total_spend + v_bill.total
    where outlet_id = v_bill.outlet_id
      and phone = v_customer_phone;
  end if;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_bill.outlet_id, auth_profile_id(), 'mark_paid', 'bills', v_bill.id, null,
          jsonb_build_object('bill_no', v_bill_no, 'total', v_bill.total));

  return to_jsonb(v_bill);
end;
$$;

grant execute on function mark_paid(uuid) to authenticated;

create or replace function void_bill(p_bill_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to void a bill';
  end if;

  select * into v_bill from bills where id = p_bill_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if not is_staff(v_bill.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() not in ('super_admin', 'manager') then
    raise exception 'Voiding a bill needs a manager or admin';
  end if;
  if v_bill.status = 'void' then raise exception 'Bill already void'; end if;

  update bills set status = 'void', void_reason = p_reason, voided_by = auth_profile_id(), voided_at = now()
    where id = p_bill_id
    returning * into v_bill;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_bill.outlet_id, auth_profile_id(), 'void_bill', 'bills', v_bill.id,
          jsonb_build_object('status', 'paid'), jsonb_build_object('status', 'void', 'reason', p_reason));

  return to_jsonb(v_bill);
end;
$$;

grant execute on function void_bill(uuid, text) to authenticated;

-- ===================== reports =====================

create or replace function report_sales(p_from date, p_to date, p_group_by text default 'day')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id uuid := auth_outlet_id();
  v_from date := p_from;
  v_to date := p_to;
  v_result jsonb;
begin
  if v_outlet_id is null then raise exception 'Not permitted'; end if;

  if has_permission('reports_view_all') then
    null;
  elsif has_permission('reports_view_own') then
    if auth_role() = 'cashier' then
      v_from := current_date;
      v_to := current_date;
    end if;
  else
    raise exception 'Not permitted to view reports';
  end if;

  with scoped_bills as (
    select b.*, ts.waiter_id
    from bills b
    join table_sessions ts on ts.id = b.session_id
    where b.outlet_id = v_outlet_id
      and b.status = 'paid'
      and b.created_at::date between v_from and v_to
      and (
        has_permission('reports_view_all')
        or (auth_role() = 'waiter' and ts.waiter_id = auth_profile_id())
        or (auth_role() = 'cashier')
      )
  ),
  grouped as (
    select
      case p_group_by
        when 'month' then to_char(created_at, 'YYYY-MM')
        when 'year' then to_char(created_at, 'YYYY')
        when 'waiter' then waiter_id::text
        else created_at::date::text
      end as bucket,
      count(*) as bills,
      sum(subtotal) as gross,
      sum(discount) as discounts,
      sum(tax_total) as tax,
      sum(total) as net
    from scoped_bills
    group by 1
    order by 1
  )
  select coalesce(jsonb_agg(grouped), '[]'::jsonb) into v_result from grouped;

  return v_result;
end;
$$;

grant execute on function report_sales(date, date, text) to authenticated;

create or replace view v_dish_sales
with (security_invoker = true) as
select oi.outlet_id, mi.id as item_id, mi.name, mi.category_id,
       sum(oi.qty) filter (where oi.status <> 'cancelled') as qty_sold,
       sum(oi.unit_price * oi.qty) filter (where oi.status <> 'cancelled') as revenue,
       count(*) filter (where oi.status = 'cancelled') as cancellations
from order_items oi
join menu_items mi on mi.id = oi.item_id
group by oi.outlet_id, mi.id, mi.name, mi.category_id;

create or replace view v_table_sales
with (security_invoker = true) as
select b.outlet_id, t.id as table_id, t.name as table_name,
       count(distinct b.id) as bills,
       sum(b.total) as revenue,
       avg(extract(epoch from (ts.closed_at - ts.opened_at)) / 60) as avg_turnaround_minutes
from bills b
join table_sessions ts on ts.id = b.session_id
join tables t on t.id = ts.table_id
where b.status = 'paid'
group by b.outlet_id, t.id, t.name;

grant select on v_dish_sales to authenticated;
grant select on v_table_sales to authenticated;

-- ===================== outlet provisioning =====================
-- Convenience wrapper for creating a brand-new outlet with its default roles (local dev / future
-- multi-outlet onboarding). Restricted to service_role since it has no existing outlet to scope to.

create or replace function provision_outlet(p_name text, p_settings jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id uuid;
begin
  insert into outlets (name, settings) values (p_name, p_settings) returning id into v_outlet_id;
  perform provision_default_roles(v_outlet_id);
  return v_outlet_id;
end;
$$;

revoke execute on function provision_outlet(text, jsonb) from public, anon, authenticated;
grant execute on function provision_outlet(text, jsonb) to service_role;
