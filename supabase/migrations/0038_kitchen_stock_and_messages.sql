-- Two things the kitchen display needs that RLS deliberately does not hand it directly.
--
-- 1. Marking a dish out of stock. menu_items writes are admin/manager only (0009), and that
--    should stay true: the kitchen must not be able to change prices or names. But the
--    kitchen is the first to know the paneer has run out, so it gets exactly one column,
--    in_stock, through a narrow RPC. place_order already refuses out-of-stock items, so
--    the moment this flips no new order can include the dish.
--
-- 2. Messaging a table's waiter about a ticket. notifications has no insert policy for
--    staff (rows are written by server functions), so the kitchen goes through an RPC that
--    fills in table, session and target waiter from the order instead of trusting the
--    client to supply them.

create or replace function kitchen_set_item_stock(p_item_id uuid, p_in_stock boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item menu_items%rowtype;
begin
  if auth_role() is null or auth_role() not in ('kitchen', 'manager', 'super_admin') then
    raise exception 'Not permitted to change stock';
  end if;

  select * into v_item from menu_items where id = p_item_id for update;
  if not found then raise exception 'Menu item not found'; end if;
  if not is_staff(v_item.outlet_id) then raise exception 'Not your outlet'; end if;

  if v_item.in_stock = p_in_stock then
    return;
  end if;

  update menu_items set in_stock = p_in_stock where id = p_item_id;

  -- Running out mid-service is exactly what a manager asks about later ("why couldn't
  -- table 6 order the biryani?"), so it is recorded like a price change is.
  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_item.outlet_id, auth_profile_id(),
          case when p_in_stock then 'back_in_stock' else 'out_of_stock' end,
          'menu_items', p_item_id,
          jsonb_build_object('in_stock', v_item.in_stock),
          jsonb_build_object('in_stock', p_in_stock));
end;
$$;

grant execute on function kitchen_set_item_stock(uuid, boolean) to authenticated;

create or replace function kitchen_message_waiter(p_order_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_session table_sessions%rowtype;
  v_table_name text;
  v_message text := nullif(btrim(p_message), '');
begin
  if auth_role() is null or auth_role() not in ('kitchen', 'manager', 'super_admin') then
    raise exception 'Not permitted to message waiters';
  end if;
  if v_message is null then raise exception 'Message is empty'; end if;
  if length(v_message) > 200 then raise exception 'Message is too long (200 characters max)'; end if;

  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if not is_staff(v_order.outlet_id) then raise exception 'Not your outlet'; end if;

  select * into v_session from table_sessions where id = v_order.session_id;
  select name into v_table_name from tables where id = v_session.table_id;

  -- target_user_id follows the session's waiter. An unassigned session leaves it null,
  -- which notifications_select_staff shows to every staff member, so the message still
  -- reaches someone instead of vanishing.
  insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
  values (v_order.outlet_id, 'kitchen_message', v_session.table_id, v_session.id, v_session.waiter_id,
          jsonb_build_object(
            'order_id', p_order_id,
            'kot_number', v_order.kot_number,
            'table_name', v_table_name,
            'message', v_message,
            'sent_by', auth_profile_id()
          ));
end;
$$;

grant execute on function kitchen_message_waiter(uuid, text) to authenticated;
