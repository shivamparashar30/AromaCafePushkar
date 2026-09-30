-- Waste tracking for the kitchen display, plus the priority flag the board reads.

create table if not exists waste_log (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  item_id uuid references menu_items(id),
  -- Denormalised: a menu item can be renamed or retired, and a waste report must still
  -- say what was actually thrown away.
  item_name text not null,
  qty int not null check (qty > 0),
  unit_price bigint not null default 0,
  reason text not null,
  note text,
  station text,
  refired boolean not null default false,
  staff_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_waste_log_outlet_created on waste_log(outlet_id, created_at desc);
create index if not exists idx_waste_log_item on waste_log(item_id);

alter table waste_log enable row level security;

create policy waste_log_select_staff on waste_log
  for select to authenticated
  using (is_staff(outlet_id));

-- Writes go through record_waste(), which is SECURITY DEFINER; there is no direct insert
-- path, so a kitchen device cannot forge or edit the log.
create policy waste_log_write_admin_manager on waste_log
  for all to authenticated
  using (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'))
  with check (is_staff(outlet_id) and auth_role() in ('super_admin', 'manager'));

-- Priority / VIP marking. Nothing writes it yet; the board reads it so the flag is ready
-- for the waiter and admin apps.
alter table orders add column if not exists is_priority boolean not null default false;

-- Order rollup: 'wasted' is terminal like 'cancelled'. A wasted item is finished as far
-- as the kitchen is concerned and must not hold the order open.
create or replace function recompute_order_status(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_total int;
  v_closed int;
  v_cooking int;
  v_ready int;
  v_served int;
  v_wasted int;
  v_status order_status;
begin
  select count(*),
         count(*) filter (where status in ('cancelled', 'wasted')),
         count(*) filter (where status = 'cooking'),
         count(*) filter (where status = 'ready'),
         count(*) filter (where status = 'served'),
         count(*) filter (where status = 'wasted')
    into v_total, v_closed, v_cooking, v_ready, v_served, v_wasted
  from order_items where order_id = p_order_id;

  if v_total = 0 then
    return;
  elsif v_total = v_closed then
    v_status := case when v_wasted > 0 then 'wasted'::order_status else 'cancelled'::order_status end;
  elsif v_served + v_closed = v_total then
    v_status := 'served';
  elsif v_ready + v_served + v_closed = v_total then
    v_status := 'ready';
  elsif v_cooking > 0 or v_ready > 0 or v_served > 0 then
    v_status := 'cooking';
  else
    v_status := 'placed';
  end if;

  update orders set status = v_status where id = p_order_id and status is distinct from v_status;
end;
$$;

-- record_waste: mark an item wasted, log it, and optionally re-fire a fresh one.
create or replace function record_waste(
  p_order_item_id uuid,
  p_reason text,
  p_note text default null,
  p_refire boolean default false,
  p_qty int default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_item order_items%rowtype;
  v_name text;
  v_qty int;
  v_new_item uuid;
begin
  select * into v_item from order_items where id = p_order_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  if not is_staff(v_item.outlet_id) then raise exception 'Not your outlet'; end if;

  if auth_role() not in ('kitchen', 'super_admin', 'manager') then
    raise exception 'Not permitted to record waste';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to record waste';
  end if;
  if v_item.status in ('cancelled', 'wasted') then
    raise exception 'This item is already closed';
  end if;

  v_qty := least(greatest(coalesce(p_qty, v_item.qty), 1), v_item.qty);
  select name into v_name from menu_items where id = v_item.item_id;

  update order_items set status = 'wasted' where id = p_order_item_id;

  insert into waste_log (outlet_id, order_item_id, item_id, item_name, qty, unit_price,
                         reason, note, station, refired, staff_id)
  values (v_item.outlet_id, p_order_item_id, v_item.item_id, coalesce(v_name, 'Unknown item'),
          v_qty, v_item.unit_price, trim(p_reason), nullif(trim(coalesce(p_note, '')), ''),
          v_item.station, coalesce(p_refire, false), auth_profile_id());

  insert into order_events (outlet_id, order_id, order_item_id, from_status, to_status, actor_id)
  values (v_item.outlet_id, v_item.order_id, p_order_item_id, v_item.status::text, 'wasted',
          auth_profile_id());

  -- Re-fire puts a fresh line back on the board at 'ordered'. The wasted line stays for
  -- the audit trail; because compute_bill_totals excludes wasted lines, the guest is
  -- charged once -- for the line that was actually cooked.
  if coalesce(p_refire, false) then
    insert into order_items (outlet_id, order_id, item_id, variant_id, qty, unit_price,
                             notes, status, station)
    values (v_item.outlet_id, v_item.order_id, v_item.item_id, v_item.variant_id, v_qty,
            v_item.unit_price, v_item.notes, 'ordered', v_item.station)
    returning id into v_new_item;

    insert into order_item_addons (order_item_id, addon_id, price)
    select v_new_item, addon_id, price from order_item_addons where order_item_id = p_order_item_id;

    insert into order_events (outlet_id, order_id, order_item_id, from_status, to_status, actor_id)
    values (v_item.outlet_id, v_item.order_id, v_new_item, null, 'ordered', auth_profile_id());
  end if;

  perform recompute_order_status(v_item.order_id);

  return jsonb_build_object('wasted_item', p_order_item_id, 'refired_item', v_new_item);
end;
$$;

grant execute on function record_waste(uuid, text, text, boolean, int) to authenticated;
