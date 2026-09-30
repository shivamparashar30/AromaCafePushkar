-- Adding 'wasted' means every place that special-cased 'cancelled' now has a second
-- terminal state to account for. Missing any of these has real consequences:
--
--  * compute_bill_totals excluded only 'cancelled', so a guest would have been CHARGED
--    for food the kitchen threw away.
--  * mark_paid swept everything not in ('served','cancelled') to 'served', which would
--    have quietly rewritten wasted items as served and destroyed the waste record.
--  * leave_table counted any non-cancelled order as active, so a fully wasted order
--    would have blocked the table from being freed.

-- 1. Billing: wasted food is not sold.
create or replace function compute_bill_totals(p_session_id uuid, p_discount bigint default 0)
returns table (subtotal bigint, tax_total bigint, service_charge bigint, round_off bigint, total bigint)
language plpgsql
set search_path = public
as $$
declare
  v_outlet_id uuid;
  v_subtotal bigint := 0;
  v_settings jsonb;
  v_service_on boolean;
  v_service_pct numeric;
  v_service bigint := 0;
  v_tax_enabled boolean;
  v_tax_pct numeric;
  v_taxable_base bigint;
  v_tax bigint := 0;
  v_grand bigint;
  v_round bigint;
begin
  select ts.outlet_id into v_outlet_id from table_sessions ts where ts.id = p_session_id;

  select coalesce(sum(
           oi.unit_price * oi.qty
           + coalesce((select sum(oia.price) from order_item_addons oia where oia.order_item_id = oi.id), 0)
         ), 0)
    into v_subtotal
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.session_id = p_session_id and oi.status not in ('cancelled', 'wasted');

  select o.settings into v_settings from outlets o where o.id = v_outlet_id;

  v_service_on := coalesce((v_settings->'service_charge'->>'enabled')::boolean, false);
  v_service_pct := coalesce((v_settings->'service_charge'->>'percent')::numeric, 0);
  v_tax_enabled := coalesce((v_settings->'tax'->>'enabled')::boolean, false);
  v_tax_pct := coalesce((v_settings->'tax'->>'percent')::numeric, 0);

  v_taxable_base := greatest(v_subtotal - coalesce(p_discount, 0), 0);

  if v_service_on and v_service_pct > 0 then
    v_service := round(v_taxable_base * v_service_pct / 100.0);
  end if;

  if v_tax_enabled and v_tax_pct > 0 then
    v_tax := round(v_taxable_base * v_tax_pct / 100.0);
  elsif v_subtotal > 0 then
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
      where o.session_id = p_session_id and oi.status not in ('cancelled', 'wasted')
    ) lines
    left join tax_groups tg on tg.id = lines.tax_group_id;
  end if;

  v_grand := v_taxable_base + v_service + v_tax;
  v_round := (round(v_grand / 100.0) * 100) - v_grand;
  v_grand := v_grand + v_round;

  return query select v_subtotal, v_tax, v_service, v_round, v_grand;
end;
$$;

-- 2. mark_paid must leave wasted items alone when it sweeps the board clear.
do $patch$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mark_paid';

  if position('''served'', ''cancelled'', ''wasted''' in v_src) > 0 then
    raise notice 'mark_paid already excludes wasted';
    return;
  end if;

  v_src := replace(v_src,
    'and oi.status not in (''served'', ''cancelled'')',
    'and oi.status not in (''served'', ''cancelled'', ''wasted'')');

  execute format(
    'create or replace function public.mark_paid(p_bill_id uuid) returns jsonb '
    'language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;

-- 3. leave_table: a wasted order is finished, so it must not hold the table.
do $patch$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'leave_table';

  if position('not in (''cancelled'', ''wasted'')' in v_src) > 0 then
    raise notice 'leave_table already excludes wasted';
    return;
  end if;

  v_src := replace(v_src,
    'where o.session_id = p_session_id and o.status <> ''cancelled''',
    'where o.session_id = p_session_id and o.status not in (''cancelled'', ''wasted'')');

  execute format(
    'create or replace function public.leave_table(p_session_id uuid) returns void '
    'language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;

-- 4. The kitchen needs to step an item BACK for undo (Ready -> Preparing -> New), and a
--    waiter needs to recall one they served by mistake. Waste still goes through
--    record_waste, never here.
create or replace function set_item_status(p_item_ids uuid[], p_status order_item_status)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role app_role := auth_role();
begin
  if exists (select 1 from order_items oi where oi.id = any(p_item_ids) and not is_staff(oi.outlet_id)) then
    raise exception 'Not your outlet';
  end if;

  if v_role in ('super_admin', 'manager') then
    null;

  elsif v_role = 'kitchen' then
    if not has_permission('item_status_update') then
      raise exception 'Not permitted to update item status';
    end if;
    if p_status not in ('ordered', 'cooking', 'ready') then
      raise exception 'The kitchen can move items between New, Preparing and Ready only. A waiter marks them served.';
    end if;

  elsif v_role in ('waiter', 'cashier') then
    if p_status not in ('served', 'ready') then
      raise exception 'A waiter can only mark items served, or recall one back to ready.';
    end if;

  else
    raise exception 'Not permitted to update item status';
  end if;

  perform apply_item_status(p_item_ids, p_status, auth_profile_id());
end;
$$;

grant execute on function set_item_status(uuid[], order_item_status) to authenticated;
