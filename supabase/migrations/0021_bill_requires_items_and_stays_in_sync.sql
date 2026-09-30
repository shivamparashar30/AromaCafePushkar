-- Two problems with the open bill.
--
-- 1. create_bill happily produced a zero-value bill for a table with no items, putting
--    the table into 'bill_requested' with a ₹0.00 bill and no orders -- a dead end.
--
-- 2. An open bill was only recomputed when create_bill was called again. Adding items
--    afterwards (place_order / customer_place_order) or cancelling one left the bill
--    showing stale totals until someone happened to press Create bill a second time.
--    Triggers keep it in sync instead, so every path that touches items is covered --
--    including ones added later, and including add-ons, which change the line price.
--
-- Also: leave_table closed a session without touching bills, stranding an open bill on a
-- closed session. Nothing can settle or void such a row through the UI and it counts as
-- outstanding forever. It is now voided on the way out, and the existing strays cleaned.

create or replace function refresh_open_bill(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_totals record;
begin
  select * into v_bill from bills where session_id = p_session_id and status = 'open' for update;
  if not found then return; end if;

  -- The discount already on the bill is preserved; compute_bill_totals applies it.
  select * into v_totals from compute_bill_totals(p_session_id, v_bill.discount);

  update bills
    set subtotal      = v_totals.subtotal,
        tax_total     = v_totals.tax_total,
        service_charge= v_totals.service_charge,
        round_off     = v_totals.round_off,
        total         = v_totals.total
    where id = v_bill.id
      and (subtotal, tax_total, service_charge, round_off, total)
          is distinct from
          (v_totals.subtotal, v_totals.tax_total, v_totals.service_charge,
           v_totals.round_off, v_totals.total);
end;
$$;

create or replace function order_items_refresh_bill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  select o.session_id into v_session_id
  from orders o
  where o.id = coalesce(new.order_id, old.order_id);

  if v_session_id is not null then
    perform refresh_open_bill(v_session_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_items_refresh_bill on order_items;
create trigger trg_order_items_refresh_bill
  after insert or delete or update of qty, unit_price, status on order_items
  for each row execute function order_items_refresh_bill();

create or replace function order_item_addons_refresh_bill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  select o.session_id into v_session_id
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.id = coalesce(new.order_item_id, old.order_item_id);

  if v_session_id is not null then
    perform refresh_open_bill(v_session_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_item_addons_refresh_bill on order_item_addons;
create trigger trg_order_item_addons_refresh_bill
  after insert or delete or update on order_item_addons
  for each row execute function order_item_addons_refresh_bill();

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

create or replace function leave_table(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_session table_sessions%rowtype;
  v_order_count int;
  v_assigned_name text;
begin
  select * into v_session from table_sessions where id = p_session_id and status = 'open';
  if not found then
    raise exception 'This table has already been closed.';
  end if;
  if not is_staff(v_session.outlet_id) then
    raise exception 'Not your outlet';
  end if;

  select count(*) into v_order_count
  from orders o
  where o.session_id = p_session_id and o.status <> 'cancelled';

  if v_order_count > 0 then
    raise exception
      'This table has % active order(s), so it can''t be freed yet. Generate the bill and settle it, or cancel the orders first.',
      v_order_count;
  end if;

  if auth_role() = 'waiter'
     and v_session.waiter_id is not null
     and v_session.waiter_id is distinct from auth_profile_id() then
    select name into v_assigned_name from profiles where id = v_session.waiter_id;
    raise exception 'This table is assigned to %. Ask them or a manager to free it.',
      coalesce(v_assigned_name, 'another waiter');
  end if;

  -- There are no live orders at this point, so any open bill is an empty leftover.
  update bills
    set status = 'void',
        void_reason = 'Table freed without billing',
        voided_by = auth_profile_id(),
        voided_at = now()
    where session_id = p_session_id and status = 'open';

  update table_sessions set status = 'closed', closed_at = now() where id = p_session_id;
  update tables set status = 'free' where id = v_session.table_id;
end;
$$;

-- Clean up bills already stranded open on a closed session.
update bills b
set status = 'void',
    void_reason = coalesce(void_reason, 'Session closed without settling this bill'),
    voided_at = coalesce(voided_at, now())
from table_sessions ts
where ts.id = b.session_id
  and b.status = 'open'
  and ts.status = 'closed';
