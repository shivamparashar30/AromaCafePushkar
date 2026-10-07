-- place_order and leave_table were already relaxed so any waiter can work any table, but
-- the rest of the chain still demanded the table be assigned to the caller. The result was
-- a dead end: a waiter could add items to a QR table and then could not bill it, take
-- payment, settle it, or cancel a line — "This table is not assigned to you".
--
-- It bit hardest on exactly the flow this system is built around. A customer-scanned
-- session is created by customer_place_order with waiter_id = NULL, and
-- `waiter_id is distinct from auth_profile_id()` is TRUE against NULL, so *every* waiter
-- was refused, not merely the wrong one. Affected: create_bill, add_payment, mark_paid,
-- cancel_item, set_order_status.
--
-- Assignment is now advisory everywhere: it records who is looking after a table, it does
-- not gate service. Outlet scoping and the per-action permission checks are untouched —
-- a waiter still cannot settle without bill_mark_paid, nor cancel a cooked item without a
-- manager (both verified).
--
-- pg_get_function_arguments (not ..._identity_arguments) is required when recreating:
-- the identity form omits DEFAULT clauses, and dropping a default errors with
-- "cannot remove parameter defaults from existing function".
do $relax$
declare
  r record;
  v_src text;
  v_before text;
begin
  for r in
    select p.proname,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result,
           p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc like '%not assigned to you%'
  loop
    v_src := r.prosrc;
    v_before := v_src;

    -- create_bill: direct column comparison on the session row.
    v_src := replace(v_src,
      'if auth_role() = ''waiter'' and v_session.waiter_id is distinct from auth_profile_id() then
    raise exception ''This table is not assigned to you'';
  end if;', '');

    -- add_payment / mark_paid: EXISTS against the bill's session.
    v_src := replace(v_src,
      'if auth_role() = ''waiter'' and not exists (
    select 1 from table_sessions ts where ts.id = v_bill.session_id and ts.waiter_id = auth_profile_id()
  ) then
    raise exception ''This table is not assigned to you'';
  end if;', '');

    -- cancel_item: keeps its own role branch, so only the ownership test is dropped.
    v_src := replace(v_src,
      'if not exists (
        select 1 from orders o join table_sessions ts on ts.id = o.session_id
        where o.id = v_item.order_id and ts.waiter_id = auth_profile_id()
      ) then
        raise exception ''This table is not assigned to you'';
      end if;', 'null;');

    -- set_order_status: same shape, different alias.
    v_src := replace(v_src,
      'if not exists (
      select 1 from orders o join table_sessions ts on ts.id = o.session_id
      where o.id = p_order_id and ts.waiter_id = auth_profile_id()
    ) then
      raise exception ''This table is not assigned to you'';
    end if;', 'null;');

    if v_src = v_before then
      raise notice 'no known ownership check matched in %, leaving it alone', r.proname;
      continue;
    end if;

    execute format(
      'create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path = public as %L',
      r.proname, r.args, r.result, v_src
    );
  end loop;
end
$relax$;
