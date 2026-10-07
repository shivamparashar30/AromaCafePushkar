-- cancel_item refused to touch an item that was already 'served' or 'cancelled', but
-- 'wasted' did not exist when that guard was written (it arrives in 0030). Cancelling a
-- wasted item would flip its status and silently detach it from its waste_log row, so the
-- kitchen's record of what was thrown away would no longer match the order.
--
-- 'wasted' is terminal in exactly the same way, so it joins the guard.
do $patch$
declare
  v_src text;
  v_args text;
  v_result text;
begin
  select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    into v_src, v_args, v_result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cancel_item';

  if v_src is null then
    raise exception 'cancel_item not found';
  end if;

  if position('''served'', ''cancelled'', ''wasted''' in v_src) > 0 then
    raise notice 'cancel_item already guards wasted';
    return;
  end if;

  v_src := replace(v_src,
    'if v_item.status in (''served'', ''cancelled'') then',
    'if v_item.status in (''served'', ''cancelled'', ''wasted'') then');

  -- pg_get_function_arguments (not ..._identity_arguments): the identity form drops
  -- DEFAULT clauses and recreating without them errors.
  execute format(
    'create or replace function public.cancel_item(%s) returns %s '
    'language plpgsql security definer set search_path = public as %L',
    v_args, v_result, v_src
  );
end
$patch$;
