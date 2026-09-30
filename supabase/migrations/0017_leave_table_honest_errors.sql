-- leave_table reported the wrong reason on its most common failure.
--
-- The assignment check ran before the active-orders check and read:
--
--     if auth_role() = 'waiter' and v_session.waiter_id is distinct from auth_profile_id() then
--       raise exception 'This table is not assigned to you';
--
-- A session created by customer_place_order -- customer scanned the QR and ordered
-- before any waiter claimed the table -- has waiter_id = NULL, and NULL is distinct
-- from any id, so that branch fired first. The waiter was told the table was not
-- theirs, when the real blocker was the orders sitting on it. It also meant nobody
-- could ever free an unclaimed table.
--
-- Two changes:
--  1. The active-orders check runs first. It is the genuine reason a table cannot be
--     released and it applies to every role, so it is what the waiter should hear.
--  2. An UNASSIGNED table is no longer treated as someone else's. Any waiter may free
--     it, which matches place_order -- already relaxed to let any waiter serve an
--     unclaimed table. Only a table genuinely held by a different waiter is refused,
--     and that message now names who holds it.
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

  update table_sessions set status = 'closed', closed_at = now() where id = p_session_id;
  update tables set status = 'free' where id = v_session.table_id;
end;
$$;
