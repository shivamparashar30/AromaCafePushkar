-- The Counter floor was still listed under Table structure: its slots were filtered out
-- in the client, so it rendered as an empty floor with a Delete floor button that could
-- never work -- delete_floor correctly counted the 3 real (hidden) counter slots and
-- refused, which read as a broken button.
--
-- Hiding it by name would be fragile: a user is free to create a floor called "Counter".
-- The floor is flagged as system-owned instead, which is what it actually is --
-- create_walkin_bill creates and owns it, and nothing in the UI should offer to rename or
-- delete it. The client filters on that flag, and delete_floor refuses outright.
alter table floors add column if not exists is_system boolean not null default false;

update floors f
set is_system = true
where exists (select 1 from tables t where t.floor_id = f.id and t.is_counter);

-- create_walkin_bill must flag the floor when it creates it, and must look it up by the
-- flag rather than by name.
do $patch$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_walkin_bill';

  if position('is_system' in v_src) > 0 then
    raise notice 'create_walkin_bill already flags the Counter floor';
    return;
  end if;

  v_src := replace(v_src,
    'insert into floors (outlet_id, name, sort_order)' || chr(10) ||
    '    values (v_outlet, ''Counter'', 999)',
    'insert into floors (outlet_id, name, sort_order, is_system)' || chr(10) ||
    '    values (v_outlet, ''Counter'', 999, true)');

  v_src := replace(v_src,
    'where outlet_id = v_outlet and name = ''Counter'' and deleted_at is null limit 1;',
    'where outlet_id = v_outlet and is_system and deleted_at is null limit 1;');

  execute format(
    'create or replace function public.create_walkin_bill('
    'p_items jsonb, p_customer_name text default null, p_customer_phone text default null) '
    'returns jsonb language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;

-- A system floor is never user-deletable, whatever it contains.
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
  if v_floor.is_system then
    raise exception 'The % area is managed automatically and cannot be deleted.', v_floor.name;
  end if;

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
