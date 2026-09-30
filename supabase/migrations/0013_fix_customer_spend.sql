-- Fix mark_paid to update customer total_spend when bill is paid
-- Fix customer_place_order to only increment visits on new session

-- mark_paid: already updated in 0010 source, this ensures it's applied
CREATE OR REPLACE FUNCTION mark_paid(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

-- customer_place_order: visits only increment on new session, name always updates
CREATE OR REPLACE FUNCTION customer_place_order(
  p_table_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
begin
  -- Validate table
  select * into v_table from tables where id = p_table_id and is_active;
  if not found then raise exception 'Table not found'; end if;

  -- Find or create session
  select * into v_session from table_sessions where table_id = p_table_id and status = 'open';
  if not found then
    insert into table_sessions (outlet_id, table_id, customer_name, customer_phone)
    values (v_table.outlet_id, p_table_id, p_customer_name, p_customer_phone)
    returning * into v_session;

    update tables set status = 'occupied' where id = p_table_id;
    v_is_new_session := true;
  else
    -- Update customer info on session (always update to latest name/phone)
    if p_customer_name is not null then
      update table_sessions
      set customer_name = p_customer_name,
          customer_phone = coalesce(p_customer_phone, customer_phone)
      where id = v_session.id;
    end if;
  end if;

  -- Upsert into customers table if phone is provided
  if coalesce(p_customer_phone, '') <> '' then
    if v_is_new_session then
      -- New session: create customer or increment visits
      insert into customers (outlet_id, phone, name, visits)
      values (v_session.outlet_id, p_customer_phone, p_customer_name, 1)
      on conflict (outlet_id, phone) do update
        set name = coalesce(excluded.name, customers.name),
            visits = customers.visits + 1,
            updated_at = now();
    else
      -- Existing session: ensure customer exists, update name, don't increment visits
      insert into customers (outlet_id, phone, name, visits)
      values (v_session.outlet_id, p_customer_phone, p_customer_name, 1)
      on conflict (outlet_id, phone) do update
        set name = coalesce(excluded.name, customers.name),
            updated_at = now();
    end if;
  end if;

  -- Validate items
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in order';
  end if;

  -- Create order
  select coalesce(max(kot_number), 0) + 1 into v_kot_number from orders where session_id = v_session.id;

  insert into orders (outlet_id, session_id, source, placed_by, placed_by_name, status, kot_number)
  values (v_session.outlet_id, v_session.id, 'customer', null,
          coalesce(p_customer_name, v_session.customer_name, 'Customer'), 'placed', v_kot_number)
  returning * into v_order;

  -- Insert order items
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

  -- Notify waiters about new unassigned table
  if v_is_new_session then
    insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
    values (v_session.outlet_id, 'new_unassigned_table', v_session.table_id, v_session.id, null,
            jsonb_build_object('order_id', v_order.id, 'customer_name', p_customer_name));
  end if;

  return jsonb_build_object('order_id', v_order.id, 'kot_number', v_order.kot_number, 'session_id', v_session.id);
end;
$$;
