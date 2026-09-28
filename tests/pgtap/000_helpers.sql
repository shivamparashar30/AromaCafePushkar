-- Shared test helper: impersonate a seeded staff member by phone number for the rest of the
-- transaction, by setting the request.jwt.claims GUC the same way PostgREST would for a real
-- request. Used by every RLS/RPC test file (each file runs in its own begin/rollback transaction).
-- Deliberately NOT wrapped in begin/rollback: the function definitions below need to persist for
-- the other test files (each a separate psql connection) to use.

select plan(1);

create extension if not exists pgtap with schema extensions;

create or replace function test_login_as(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  select p.id, p.outlet_id, r.name as role_name
    into v_profile
  from profiles p
  join roles r on r.id = p.role_id
  where p.phone = p_phone;

  if not found then
    raise exception 'test_login_as: no seeded profile with phone %', p_phone;
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_profile.id::text,
    'role', 'authenticated',
    'app_role', v_profile.role_name,
    'outlet_id', v_profile.outlet_id::text,
    'profile_id', v_profile.id::text
  )::text, true);
end;
$$;

create or replace function test_login_as_new_customer()
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_id::text,
    'role', 'authenticated',
    'is_anonymous', true
  )::text, true);
  return v_id;
end;
$$;

select pass('test helper functions loaded');
select * from finish();
