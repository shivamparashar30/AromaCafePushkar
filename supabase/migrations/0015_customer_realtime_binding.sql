-- Make realtime actually reach the customer web app.
--
-- Realtime evaluates RLS directly as the subscribing user. Every customer-side
-- SELECT policy in 0009 gates on customer_session_id(), which resolves auth.uid()
-- through table_session_customers:
--
--   create policy orders_select_customer on orders
--     for select to authenticated
--     using (is_customer() and session_id = customer_session_id());
--
-- Nothing was writing that binding row -- 0 rows across 7 QR sessions -- so the
-- anonymous device could read nothing, and realtime delivered nothing. The page
-- still looked fine because it reads through SECURITY DEFINER RPCs (resolve_qr,
-- customer_fetch_orders), which bypass RLS entirely. Only the live updates were lost.
--
-- 0010's resolve_qr did insert the binding, but the copy running on the remote
-- project had been hand-edited to stop creating sessions on scan and lost the insert
-- along the way. Both functions below are therefore patched FROM THEIR OWN LIVE
-- SOURCE rather than retyped, so that un-migrated drift is preserved rather than
-- silently reverted. Each patch is a no-op if the binding is already present, and
-- aborts loudly if the body no longer matches the expected shape.

-- ---------------------------------------------------------------------------
-- resolve_qr: bind on scan, when a session already exists
-- ---------------------------------------------------------------------------

do $patch$
declare
  v_src text;
  v_anchor text := 'select * into v_session from table_sessions where table_id = v_table.id and status = ''open'';';
  v_bind text := '
  -- Bind this anonymous device to the open session so RLS (and therefore realtime)
  -- lets it read that session''s orders, items and bill.
  if v_session.id is not null and auth.uid() is not null then
    insert into table_session_customers (session_id, customer_auth_id)
    values (v_session.id, auth.uid())
    on conflict (session_id, customer_auth_id) do nothing;
  end if;
';
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolve_qr';

  if v_src is null then
    raise exception 'resolve_qr not found';
  end if;

  if position('table_session_customers' in v_src) > 0 then
    raise notice 'resolve_qr already binds the customer; leaving it alone';
    return;
  end if;

  if position(v_anchor in v_src) = 0 then
    raise exception 'resolve_qr no longer matches the expected shape; refusing to patch blindly';
  end if;

  v_src := replace(v_src, v_anchor, v_anchor || v_bind);

  execute format(
    'create or replace function public.resolve_qr(p_token text) returns jsonb '
    'language plpgsql security definer set search_path = public as %L',
    v_src
  );
end
$patch$;

-- ---------------------------------------------------------------------------
-- customer_place_order: bind on first order, which is what creates the session
-- ---------------------------------------------------------------------------

do $patch$
declare
  v_src text;
  v_anchor text := '  if jsonb_typeof(p_items) is distinct from ''array'' or jsonb_array_length(p_items) = 0 then';
  v_bind text := '  -- Bind this anonymous device to the session so RLS (and therefore realtime) lets
  -- it read back the orders it just placed.
  if auth.uid() is not null then
    insert into table_session_customers (session_id, customer_auth_id, name, phone)
    values (v_session.id, auth.uid(), v_name, v_phone)
    on conflict (session_id, customer_auth_id) do update
      set name = excluded.name, phone = excluded.phone;
  end if;

';
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'customer_place_order';

  if v_src is null then
    raise exception 'customer_place_order not found';
  end if;

  if position('table_session_customers' in v_src) > 0 then
    raise notice 'customer_place_order already binds the customer; leaving it alone';
    return;
  end if;

  if position(v_anchor in v_src) = 0 then
    raise exception 'customer_place_order no longer matches the expected shape';
  end if;

  v_src := replace(v_src, v_anchor, v_bind || v_anchor);

  execute format(
    'create or replace function public.customer_place_order('
    'p_table_id uuid, p_customer_name text, p_customer_phone text, p_items jsonb) '
    'returns jsonb language plpgsql security definer set search_path = public as %L',
    v_src
  );
end
$patch$;

notify pgrst, 'reload schema';
