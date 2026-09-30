-- Invoice numbers were allocated only in mark_paid, so an open bill carried no number
-- and a bill preview had nothing to show.
--
-- The number is now allocated when the bill is created, which is what a bill handed to a
-- guest before payment needs. This does not weaken the gap-free guarantee -- it
-- strengthens it. Previously a voided bill was never numbered, so it vanished from the
-- sequence and could not be reconciled. Now every bill raised gets a number and a voided
-- one keeps it, marked void, so the whole run of numbers is accounted for.
--
-- mark_paid allocates only when the number is still missing, covering bills opened
-- before this change.

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

  if not exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where o.session_id = p_session_id and oi.status <> 'cancelled'
  ) then
    raise exception 'Add at least one item to this table before creating a bill.';
  end if;

  v_customer_id := upsert_customer_by_phone(
    v_session.outlet_id, v_session.customer_phone, v_session.customer_name
  );

  select * into v_bill from bills where session_id = p_session_id and status = 'open';
  if found then
    select * into v_totals from compute_bill_totals(p_session_id, v_bill.discount);
    update bills set subtotal = v_totals.subtotal, tax_total = v_totals.tax_total,
           service_charge = v_totals.service_charge, round_off = v_totals.round_off,
           total = v_totals.total, customer_id = coalesce(v_customer_id, customer_id),
           bill_no = coalesce(bill_no, allocate_bill_number(v_session.outlet_id))
      where id = v_bill.id
      returning * into v_bill;
    return to_jsonb(v_bill);
  end if;

  select * into v_totals from compute_bill_totals(p_session_id, 0);

  insert into bills (outlet_id, session_id, customer_id, bill_no, subtotal, discount,
                     service_charge, tax_total, round_off, total, status)
  values (v_session.outlet_id, p_session_id, v_customer_id,
          allocate_bill_number(v_session.outlet_id),
          v_totals.subtotal, 0, v_totals.service_charge, v_totals.tax_total,
          v_totals.round_off, v_totals.total, 'open')
  returning * into v_bill;

  update tables set status = 'bill_requested' where id = v_session.table_id;

  return to_jsonb(v_bill);
end;
$$;

grant execute on function create_bill(uuid) to authenticated;

-- mark_paid keeps whatever number the bill already carries.
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

  -- Allocated at creation now; only older bills still need one.
  v_bill_no := coalesce(v_bill.bill_no, allocate_bill_number(v_bill.outlet_id));

  select * into v_session from table_sessions where id = v_bill.session_id;

  v_customer_id := upsert_customer_by_phone(
    v_bill.outlet_id, v_session.customer_phone, v_session.customer_name
  );

  update bills
    set status = 'paid',
        bill_no = v_bill_no,
        customer_id = coalesce(v_customer_id, customer_id)
    where id = p_bill_id
    returning * into v_bill;

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
