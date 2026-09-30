-- Narrow `visits` to COMPLETED visits.
--
-- 0014 derived visits from every table session the phone appeared on, unioned with
-- any session billed to the customer. That swept in sessions that were abandoned or
-- freed without ever being billed -- a mis-scan, a walkout, a table cleared by
-- mistake -- so the number disagreed with both the customer's bill list and their
-- total_spend. One customer showed 5 visits against 4 bills for exactly this reason:
-- a session with one order that was closed before a bill was ever created.
--
-- A visit is now one distinct session that produced a paid bill, so visits and
-- total_spend are derived from exactly the same rows and can never drift apart.
create or replace function recalc_customer_stats(p_customer_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_customer_id is null then return; end if;

  update customers set
    total_spend = coalesce((
      select sum(b.total)
      from bills b
      where b.customer_id = p_customer_id and b.status = 'paid'
    ), 0),
    visits = (
      select count(distinct b.session_id)
      from bills b
      where b.customer_id = p_customer_id and b.status = 'paid'
    ),
    updated_at = now()
  where id = p_customer_id;
end;
$$;

do $do$
declare r record;
begin
  for r in select id from customers loop
    perform recalc_customer_stats(r.id);
  end loop;
end $do$;
