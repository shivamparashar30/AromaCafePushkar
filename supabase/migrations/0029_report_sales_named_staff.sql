-- Grouping the sales report by waiter emitted the raw uuid as the bucket label, so the
-- breakdown listed "52ed872e-90d9-4180-b3e2-c4554e326707" instead of a name, and the
-- trend chart tried to plot that uuid as an axis value (rendering as "72e-9").
--
-- Grouping still happens on waiter_id -- two staff can share a name -- but the label is
-- resolved to the person afterwards. A session with no staff attached becomes
-- "Unassigned" rather than a blank row.
--
-- Two things to keep in mind here:
--  * the p_group_by default must be preserved; dropping it errors with "cannot remove
--    parameter defaults from existing function".
--  * the profiles join compares `pr.id::text = g.bucket_key`, never `bucket_key::uuid`.
--    Postgres may evaluate the cast before the p_group_by guard, and for day/month/year
--    groupings bucket_key is a date string, which would fail with "invalid input syntax
--    for type uuid".
create or replace function report_sales(p_from date, p_to date, p_group_by text default 'day'::text)
returns jsonb
language plpgsql security definer
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
        when 'month'  then to_char(created_at, 'YYYY-MM')
        when 'year'   then to_char(created_at, 'YYYY')
        -- Group on the id so same-named staff stay separate; label resolved below.
        when 'waiter' then coalesce(waiter_id::text, 'unassigned')
        else created_at::date::text
      end as bucket_key,
      count(*)       as bills,
      sum(subtotal)  as gross,
      sum(discount)  as discounts,
      sum(tax_total) as tax,
      sum(total)     as net
    from scoped_bills
    group by 1
  ),
  labelled as (
    select
      case
        when p_group_by = 'waiter' then coalesce(pr.name, 'Unassigned')
        else g.bucket_key
      end as bucket,
      g.bills, g.gross, g.discounts, g.tax, g.net
    from grouped g
    left join profiles pr
      on p_group_by = 'waiter'
     and g.bucket_key <> 'unassigned'
     and pr.id::text = g.bucket_key
    order by 1
  )
  select coalesce(jsonb_agg(labelled), '[]'::jsonb) into v_result from labelled;

  return v_result;
end;
$$;

grant execute on function report_sales(date, date, text) to authenticated;
