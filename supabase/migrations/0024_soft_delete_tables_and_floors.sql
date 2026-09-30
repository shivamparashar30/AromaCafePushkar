-- Deleting a table used to be impossible the moment it had been seated once:
-- table_sessions.table_id is ON DELETE RESTRICT, so the row was pinned by its own
-- history. Hard deletion was never the right answer anyway -- past bills read the table
-- name and floor through that row, so removing it would blank the table on every
-- historical invoice.
--
-- Tables and floors are therefore RETIRED rather than erased. The row stays so history
-- keeps resolving its name and floor (the UI marks such a bill "deleted table" in red);
-- everything user-facing filters it out.
--
-- Floors follow the same model, with the rule that a floor can only be retired once all
-- of its tables already are.

alter table tables add column if not exists deleted_at timestamptz;
alter table floors add column if not exists deleted_at timestamptz;

create index if not exists idx_tables_live on tables(outlet_id) where deleted_at is null;
create index if not exists idx_floors_live on floors(outlet_id) where deleted_at is null;

create or replace function delete_table(p_table_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
begin
  select * into v_table from tables where id = p_table_id;
  if not found then raise exception 'Table not found'; end if;
  if not is_staff(v_table.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() not in ('super_admin', 'manager') then
    raise exception 'Only an admin or manager can delete a table.';
  end if;
  if v_table.deleted_at is not null then return; end if;

  if exists (select 1 from table_sessions ts
             where ts.table_id = p_table_id and ts.status = 'open') then
    raise exception 'This table has a live session. Settle or free it before deleting.';
  end if;

  update tables
    set deleted_at = now(),
        is_active = false,
        status = 'free'
    where id = p_table_id;

  -- The name and floor are recorded here so the deletion itself is auditable, beyond the
  -- retained row.
  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_table.outlet_id, auth_profile_id(), 'delete_table', 'tables', p_table_id,
          jsonb_build_object('name', v_table.name,
                             'floor', (select name from floors where id = v_table.floor_id)),
          jsonb_build_object('deleted_at', now()));
end;
$$;

grant execute on function delete_table(uuid) to authenticated;

create or replace function delete_floor(p_floor_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_floor floors%rowtype;
  v_live int;
begin
  select * into v_floor from floors where id = p_floor_id;
  if not found then raise exception 'Floor not found'; end if;
  if not is_staff(v_floor.outlet_id) then raise exception 'Not your outlet'; end if;
  if auth_role() not in ('super_admin', 'manager') then
    raise exception 'Only an admin or manager can delete a floor.';
  end if;
  if v_floor.deleted_at is not null then return; end if;

  select count(*) into v_live
  from tables t where t.floor_id = p_floor_id and t.deleted_at is null;

  if v_live > 0 then
    raise exception
      'Delete this floor''s % table(s) first — a floor can only be removed once it is empty.',
      v_live;
  end if;

  update floors set deleted_at = now() where id = p_floor_id;

  insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
  values (v_floor.outlet_id, auth_profile_id(), 'delete_floor', 'floors', p_floor_id,
          jsonb_build_object('name', v_floor.name),
          jsonb_build_object('deleted_at', now()));
end;
$$;

grant execute on function delete_floor(uuid) to authenticated;

-- A retired counter slot must never be handed out again, and resolve_qr must refuse a
-- retired table's QR. resolve_qr is patched from its own live source because the copy on
-- this project carries un-migrated drift (see 0015).
do $patch$
declare
  v_src text;
  v_anchor text := 'select * into v_table from tables where qr_token = p_token and is_active = true;';
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolve_qr';

  if position('deleted_at is null' in v_src) > 0 then
    raise notice 'resolve_qr already filters retired tables';
    return;
  end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'resolve_qr no longer matches the expected shape';
  end if;

  v_src := replace(v_src, v_anchor,
    'select * into v_table from tables where qr_token = p_token and is_active = true and deleted_at is null;');

  execute format(
    'create or replace function public.resolve_qr(p_token text) returns jsonb '
    'language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;

-- create_walkin_bill: skip retired counter slots and a retired Counter floor.
do $patch$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_walkin_bill';

  if position('t.deleted_at is null' in v_src) > 0 then
    raise notice 'create_walkin_bill already skips retired slots';
    return;
  end if;

  v_src := replace(v_src,
    'where outlet_id = v_outlet and name = ''Counter'' limit 1;',
    'where outlet_id = v_outlet and name = ''Counter'' and deleted_at is null limit 1;');
  v_src := replace(v_src,
    'and t.is_active' || chr(10) || '    and not exists (',
    'and t.is_active' || chr(10) || '    and t.deleted_at is null' || chr(10) || '    and not exists (');

  execute format(
    'create or replace function public.create_walkin_bill('
    'p_items jsonb, p_customer_name text default null, p_customer_phone text default null) '
    'returns jsonb language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;
