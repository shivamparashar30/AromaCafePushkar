-- Custom Access Token Hook: injects app_role / outlet_id / profile_id into every JWT issued to a
-- staff member, so RLS policies can check auth.jwt() without extra joins.
-- NOTE: the claim is named "app_role", NOT "role" -- the top-level "role" claim is reserved by
-- GoTrue/PostgREST to select the Postgres session role (authenticated/anon/service_role); overwriting
-- it would break every request's DB connection.
-- Registered in supabase/config.toml under [auth.hook.custom_access_token].
-- Anonymous customer sessions have no profiles row, so they get no extra claims (handled by
-- customer-specific policies keyed on auth.uid() = table_sessions.customer_auth_id instead).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_role text;
  v_outlet_id uuid;
  v_profile_id uuid;
begin
  v_profile_id := (event->>'user_id')::uuid;

  select r.name::text, p.outlet_id
    into v_role, v_outlet_id
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = v_profile_id
    and p.is_active = true;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if v_role is not null then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{outlet_id}', to_jsonb(v_outlet_id::text));
    claims := jsonb_set(claims, '{profile_id}', to_jsonb(v_profile_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.profiles to supabase_auth_admin;
grant select on public.roles to supabase_auth_admin;

create policy "auth_admin_read_profiles" on public.profiles
  as permissive for select to supabase_auth_admin
  using (true);

create policy "auth_admin_read_roles" on public.roles
  as permissive for select to supabase_auth_admin
  using (true);

-- Convenience accessors used throughout RLS policies and RPC functions.

create or replace function auth_role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'app_role';
$$;

create or replace function auth_outlet_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'outlet_id', '')::uuid;
$$;

create or replace function auth_profile_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'profile_id', '')::uuid;
$$;

create or replace function has_permission(p_permission permission_key)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    where p.id = auth_profile_id()
      and rp.permission = p_permission
  );
$$;
