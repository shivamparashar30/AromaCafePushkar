-- When a bill is settled, close out any kitchen work still outstanding on that session.
--
-- The kitchen display filters on order status. If an order was never touched by the
-- kitchen (or was left at 'ready'), nothing ever moved its items off
-- 'ordered'/'cooking'/'ready' -- so the ticket kept sitting on the KDS after the guest
-- had paid and left, with no way to clear it.
--
-- Settling the bill means the food is accounted for, so the remaining items are marked
-- 'served'. apply_item_status writes the order_events audit rows and calls
-- recompute_order_status, so the parent orders roll up to 'served' and drop off the
-- kitchen display on their own. The count is recorded on the audit_logs row.
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
  v_pending_items uuid[];
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

  -- Clear the kitchen display for this table.
  select array_agg(oi.id) into v_pending_items
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.session_id = v_bill.session_id
    and oi.status not in ('served', 'cancelled');

  if v_pending_items is not null then
    perform apply_item_status(v_pending_items, 'served'::order_item_status, auth_profile_id());
  end if;

  v_table_id := v_session.table_id;
  update table_sessions set status = 'closed', closed_at = now() where id = v_bill.session_id;
  update tables set status = 'free' where id = v_table_id;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_bill.outlet_id, auth_profile_id(), 'mark_paid', 'bills', v_bill.id, null,
          jsonb_build_object('bill_no', v_bill_no, 'total', v_bill.total,
                             'items_auto_served', coalesce(array_length(v_pending_items, 1), 0)));

  return to_jsonb(v_bill);
end;
$$;

grant execute on function mark_paid(uuid) to authenticated;
