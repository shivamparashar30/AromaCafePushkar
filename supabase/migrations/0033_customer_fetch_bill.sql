-- The customer page could not show its own bill. bills_select_customer gates on
-- customer_session_id(), which resolves auth.uid() through table_session_customers -- and
-- with anonymous sign-ins disabled on this project there is no auth.uid() at all, so a
-- direct read returns nothing. (See the anonymous-sign-in note: realtime has the same
-- dependency.)
--
-- Every other customer read already goes through a SECURITY DEFINER RPC for exactly this
-- reason (resolve_qr, customer_fetch_orders). This follows that pattern, so the bill shows
-- whether or not anonymous auth is switched on.
--
-- The session id is only ever handed out by resolve_qr for the table actually scanned, so
-- it carries the same trust as customer_fetch_orders. Nothing identifying is returned --
-- no customer name, phone, staff or payment detail -- only the guest's own bill.
create or replace function customer_fetch_bill(p_session_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_bill bills%rowtype;
  v_items jsonb;
begin
  select * into v_bill
  from bills
  where session_id = p_session_id and status <> 'void'
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(line order by line->>'name'), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
             'id', oi.id,
             'name', mi.name || coalesce(' (' || iv.name || ')', ''),
             'qty', oi.qty,
             'addons', coalesce((
               select string_agg(a.name, ', ')
               from order_item_addons oia join addons a on a.id = oia.addon_id
               where oia.order_item_id = oi.id
             ), ''),
             'line_total', oi.unit_price * oi.qty + coalesce((
               select sum(oia.price) from order_item_addons oia where oia.order_item_id = oi.id
             ), 0)
           ) as line
    from order_items oi
    join orders o on o.id = oi.order_id
    join menu_items mi on mi.id = oi.item_id
    left join item_variants iv on iv.id = oi.variant_id
    where o.session_id = p_session_id
      -- Matches compute_bill_totals, so the lines always add up to the subtotal shown.
      and oi.status not in ('cancelled', 'wasted')
  ) lines;

  return jsonb_build_object(
    'id', v_bill.id,
    'bill_no', v_bill.bill_no,
    'status', v_bill.status,
    'subtotal', v_bill.subtotal,
    'discount', v_bill.discount,
    'service_charge', v_bill.service_charge,
    'tax_total', v_bill.tax_total,
    'round_off', v_bill.round_off,
    'total', v_bill.total,
    'items', v_items
  );
end;
$$;

grant execute on function customer_fetch_bill(uuid) to anon, authenticated;
