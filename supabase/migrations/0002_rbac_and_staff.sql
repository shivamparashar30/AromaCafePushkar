-- Outlets (root of the tenancy tree; single outlet today, multi-outlet ready)

create table outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  gstin text,
  fssai text,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_outlets_updated_at
  before update on outlets
  for each row execute function set_updated_at();

-- Permission catalog (matches the spec's Roles & Permissions matrix)

create type permission_key as enum (
  'menu_manage',
  'tables_manage',
  'ordering_settings_manage',
  'orders_place',
  'orders_cancel_after_cooking',
  'item_status_update',
  'discount_apply',
  'bill_mark_paid',
  'reports_view_all',
  'reports_view_own',
  'employee_manage',
  'employee_view',
  'settings_manage'
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  name app_role not null,
  -- null = unlimited (super_admin), 0 = not allowed, else max % discount this role can apply
  max_discount_percent numeric(5,2),
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create trigger trg_roles_updated_at
  before update on roles
  for each row execute function set_updated_at();

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission permission_key not null,
  primary key (role_id, permission)
);

-- Staff profiles. profiles.id = auth.users.id (real auth user, phone+PIN login, no password UX).

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  role_id uuid not null references roles(id),
  name text not null,
  phone text not null,
  photo_url text,
  pin_hash text not null,
  is_active boolean not null default true,
  joining_date date not null default current_date,
  assigned_areas uuid[] not null default '{}', -- floor ids
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, phone)
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create index idx_profiles_outlet on profiles(outlet_id);

-- Registered devices, for push tokens and the "registered device" PIN-login rule

create table devices (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  platform device_platform not null,
  device_identifier text not null, -- stable per-install id used by staff-pin-login to check "registered device"
  fcm_token text,
  last_seen timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_identifier)
);

create trigger trg_devices_updated_at
  before update on devices
  for each row execute function set_updated_at();

create index idx_devices_user on devices(user_id);

-- Provisions the five system roles with the spec's default permission matrix for a given outlet.
-- Called once per outlet (see seed.sql for local dev); admins can edit role_permissions afterwards.

create function provision_default_roles(p_outlet_id uuid)
returns void
language plpgsql
as $$
declare
  v_super_admin uuid;
  v_manager uuid;
  v_cashier uuid;
  v_waiter uuid;
  v_kitchen uuid;
begin
  insert into roles (outlet_id, name, max_discount_percent, is_system) values (p_outlet_id, 'super_admin', null, true) returning id into v_super_admin;
  insert into roles (outlet_id, name, max_discount_percent, is_system) values (p_outlet_id, 'manager', 20, true) returning id into v_manager;
  insert into roles (outlet_id, name, max_discount_percent, is_system) values (p_outlet_id, 'cashier', 10, true) returning id into v_cashier;
  insert into roles (outlet_id, name, max_discount_percent, is_system) values (p_outlet_id, 'waiter', 0, true) returning id into v_waiter;
  insert into roles (outlet_id, name, max_discount_percent, is_system) values (p_outlet_id, 'kitchen', 0, true) returning id into v_kitchen;

  insert into role_permissions (role_id, permission)
  select v_super_admin, p from unnest(enum_range(null::permission_key)) as p;

  insert into role_permissions (role_id, permission) values
    (v_manager, 'menu_manage'), (v_manager, 'tables_manage'), (v_manager, 'ordering_settings_manage'),
    (v_manager, 'orders_place'), (v_manager, 'orders_cancel_after_cooking'), (v_manager, 'discount_apply'),
    (v_manager, 'bill_mark_paid'), (v_manager, 'reports_view_all'), (v_manager, 'employee_view');

  insert into role_permissions (role_id, permission) values
    (v_cashier, 'orders_place'), (v_cashier, 'discount_apply'), (v_cashier, 'bill_mark_paid'),
    (v_cashier, 'reports_view_own');

  insert into role_permissions (role_id, permission) values
    (v_waiter, 'orders_place'), (v_waiter, 'bill_mark_paid'), (v_waiter, 'reports_view_own');

  insert into role_permissions (role_id, permission) values
    (v_kitchen, 'item_status_update');
end;
$$;
