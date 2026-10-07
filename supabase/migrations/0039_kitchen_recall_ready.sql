-- The kitchen can take back a "ready" it marked by mistake.
--
-- set_item_status alone would move the item back to cooking, but it leaves two lies behind:
--   * ready_at stays set (apply_item_status only fills it when null), so prep-time reports
--     would count the dish as done at the moment of the mis-tap; and
--   * the waiter still has an unacknowledged "Order ready" alert telling them to go and
--     pick up food that is not finished.
-- This RPC fixes both, and tells the waiter in so many words not to serve it.
--
-- A served item is refused: once the plate has left the pass, the kitchen cannot pull it
-- back with a button, and pretending otherwise would corrupt the bill's history.

create or replace function kitchen_recall_items(p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item order_items%rowtype;
  v_found int := 0;
  v_order_id uuid;
  v_order orders%rowtype;
  v_session table_sessions%rowtype;
  v_table_name text;
  v_names text;
begin
  if auth_role() is null or auth_role() not in ('kitchen', 'manager', 'super_admin') then
    raise exception 'Not permitted to recall items';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'No items given';
  end if;

  -- Validate (and lock) every item before changing any, so a batch never half-applies.
  for v_item in select * from order_items where id = any(p_item_ids) order by id for update loop
    v_found := v_found + 1;
    if not is_staff(v_item.outlet_id) then raise exception 'Not your outlet'; end if;
    if v_item.status = 'served' then
      raise exception 'Already served — the waiter has taken it, too late to send back';
    end if;
    if v_item.status <> 'ready' then
      raise exception 'Only ready items can be sent back to cooking';
    end if;
  end loop;
  if v_found <> (select count(distinct x) from unnest(p_item_ids) x) then
    raise exception 'Order item not found';
  end if;

  -- Same path as every other status change, so order_events records the recall and the
  -- order's own status is recomputed (a ready order drops back to cooking).
  perform apply_item_status(p_item_ids, 'cooking', auth_profile_id());
  update order_items set ready_at = null where id = any(p_item_ids);

  for v_order_id in select distinct order_id from order_items where id = any(p_item_ids) loop
    select * into v_order from orders where id = v_order_id;
    select * into v_session from table_sessions where id = v_order.session_id;
    select name into v_table_name from tables where id = v_session.table_id;

    -- Withdraw the stale "ready" alert. acknowledged_by is the kitchen user who recalled
    -- it, which is the honest answer to "who cleared this?".
    update notifications
      set acknowledged_at = now(), acknowledged_by = auth_profile_id()
      where event = 'order_ready'
        and acknowledged_at is null
        and payload->>'order_id' = v_order_id::text;

    select string_agg(oi.qty || '× ' || mi.name, ', ' order by mi.name) into v_names
      from order_items oi join menu_items mi on mi.id = oi.item_id
      where oi.order_id = v_order_id and oi.id = any(p_item_ids);

    insert into notifications (outlet_id, event, table_id, session_id, target_user_id, payload)
    values (v_order.outlet_id, 'kitchen_message', v_session.table_id, v_session.id, v_session.waiter_id,
            jsonb_build_object(
              'order_id', v_order_id,
              'kot_number', v_order.kot_number,
              'table_name', v_table_name,
              'message', 'Not ready yet, do not serve: ' || v_names || ' went back to cooking.',
              'recalled', true,
              'sent_by', auth_profile_id()
            ));
  end loop;
end;
$$;

grant execute on function kitchen_recall_items(uuid[]) to authenticated;
