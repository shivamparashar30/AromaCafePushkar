-- Local dev seed data: one outlet, two floors, six tables, a small menu, and one staff member per
-- role (phone + PIN "1234" for all of them). Run automatically by `supabase db reset`.
-- Runs as the postgres superuser (the CLI's migration/seed runner, not psql), so it can insert into
-- auth.users directly (the local-only equivalent of calling the Admin API) and call service_role-only
-- functions like provision_outlet. Written as one PL/pgSQL block since the seed runner doesn't
-- support psql meta-commands like \gset.

do $$
declare
  v_outlet_id uuid;
  v_role_super_admin uuid;
  v_role_manager uuid;
  v_role_cashier uuid;
  v_role_waiter uuid;
  v_role_kitchen uuid;
  v_floor_ground uuid;
  v_floor_terrace uuid;
  v_tax_food uuid;
  v_tax_beverage uuid;
  v_cat_starters uuid;
  v_cat_mains uuid;
  v_cat_beverages uuid;
  v_cat_desserts uuid;
  v_item_paneer_tikka uuid;
  v_item_pbm uuid;
  v_addon_group_tikka uuid;
  v_auth_super_admin uuid;
  v_auth_manager uuid;
  v_auth_cashier uuid;
  v_auth_waiter uuid;
  v_auth_waiter_2 uuid;
  v_auth_kitchen uuid;
begin
  v_outlet_id := provision_outlet(
    'Spice Route Kitchen',
    jsonb_build_object(
      'ordering', jsonb_build_object(
        'user_ordering', true,
        'online_ordering', true,
        'online_payment', false,
        'first_order_needs_confirmation', false,
        'allow_direct_table_takeover', false
      ),
      'service_charge', jsonb_build_object('enabled', true, 'percent', 5),
      'bill_prefix', 'INV'
    )
  );

  select id into v_role_super_admin from roles where outlet_id = v_outlet_id and name = 'super_admin';
  select id into v_role_manager from roles where outlet_id = v_outlet_id and name = 'manager';
  select id into v_role_cashier from roles where outlet_id = v_outlet_id and name = 'cashier';
  select id into v_role_waiter from roles where outlet_id = v_outlet_id and name = 'waiter';
  select id into v_role_kitchen from roles where outlet_id = v_outlet_id and name = 'kitchen';

  -- ===================== floors & tables =====================

  insert into floors (outlet_id, name, sort_order) values (v_outlet_id, 'Ground Floor', 1) returning id into v_floor_ground;
  insert into floors (outlet_id, name, sort_order) values (v_outlet_id, 'Terrace', 2) returning id into v_floor_terrace;

  insert into tables (outlet_id, floor_id, name, capacity, qr_token) values
    (v_outlet_id, v_floor_ground, 'T1', 4, encode(gen_random_bytes(16), 'hex')),
    (v_outlet_id, v_floor_ground, 'T2', 4, encode(gen_random_bytes(16), 'hex')),
    (v_outlet_id, v_floor_ground, 'T3', 2, encode(gen_random_bytes(16), 'hex')),
    (v_outlet_id, v_floor_ground, 'T4', 6, encode(gen_random_bytes(16), 'hex')),
    (v_outlet_id, v_floor_terrace, 'T5', 4, encode(gen_random_bytes(16), 'hex')),
    (v_outlet_id, v_floor_terrace, 'T6', 4, encode(gen_random_bytes(16), 'hex'));

  -- ===================== tax groups & menu =====================

  insert into tax_groups (outlet_id, name, cgst_percent, sgst_percent)
    values (v_outlet_id, 'Food (5% GST)', 2.5, 2.5) returning id into v_tax_food;
  insert into tax_groups (outlet_id, name, cgst_percent, sgst_percent)
    values (v_outlet_id, 'Beverages (12% GST)', 6, 6) returning id into v_tax_beverage;

  insert into categories (outlet_id, name, sort_order) values (v_outlet_id, 'Starters', 1) returning id into v_cat_starters;
  insert into categories (outlet_id, name, sort_order) values (v_outlet_id, 'Main Course', 2) returning id into v_cat_mains;
  insert into categories (outlet_id, name, sort_order) values (v_outlet_id, 'Beverages', 3) returning id into v_cat_beverages;
  insert into categories (outlet_id, name, sort_order) values (v_outlet_id, 'Desserts', 4) returning id into v_cat_desserts;

  insert into menu_items (outlet_id, category_id, tax_group_id, name, description, price, food_type, station, prep_minutes, tags)
    values (v_outlet_id, v_cat_starters, v_tax_food, 'Paneer Tikka', 'Char-grilled cottage cheese', 22000, 'veg', 'Tandoor', 15, array['Bestseller'])
    returning id into v_item_paneer_tikka;

  insert into menu_items (outlet_id, category_id, tax_group_id, name, description, price, food_type, station, prep_minutes, tags)
    values (v_outlet_id, v_cat_starters, v_tax_food, 'Chicken 65', 'Spicy fried chicken, South Indian style', 26000, 'non_veg', 'Chinese', 15, array['Bestseller']);

  insert into menu_items (outlet_id, category_id, tax_group_id, name, description, price, food_type, station, prep_minutes)
    values (v_outlet_id, v_cat_mains, v_tax_food, 'Paneer Butter Masala', 'Rich tomato-butter gravy', 28000, 'veg', 'Tandoor', 20)
    returning id into v_item_pbm;

  insert into menu_items (outlet_id, category_id, tax_group_id, name, description, price, food_type, station, prep_minutes, tags)
    values (v_outlet_id, v_cat_mains, v_tax_food, 'Butter Chicken', 'Classic creamy tomato gravy', 32000, 'non_veg', 'Tandoor', 20, array['Chef''s special']);

  insert into menu_items (outlet_id, category_id, tax_group_id, name, price, food_type, station, prep_minutes)
    values (v_outlet_id, v_cat_beverages, v_tax_beverage, 'Masala Chai', 18000, 'veg', 'Bar', 5);

  insert into menu_items (outlet_id, category_id, tax_group_id, name, price, food_type, station, prep_minutes, tags)
    values (v_outlet_id, v_cat_desserts, v_tax_food, 'Gulab Jamun', 12000, 'veg', 'Tandoor', 5, array['New']);

  -- Variants for Paneer Butter Masala (Half / Full)
  insert into item_variants (item_id, name, price, sort_order) values
    (v_item_pbm, 'Half', 18000, 1),
    (v_item_pbm, 'Full', 28000, 2);

  -- Add-ons for Paneer Tikka
  insert into addon_groups (item_id, name, min_select, max_select) values (v_item_paneer_tikka, 'Extras', 0, 2) returning id into v_addon_group_tikka;
  insert into addons (group_id, name, price) values
    (v_addon_group_tikka, 'Extra chutney', 3000),
    (v_addon_group_tikka, 'Extra cheese', 5000);

  -- ===================== staff =====================
  -- auth.users rows created directly (local-dev equivalent of the Admin API). Waiter/Kitchen use
  -- phone+PIN (PIN "1234" for everyone). Super Admin/Manager/Cashier are "office" roles that also
  -- get email+password for the Admin dashboard (spec: "admins use email + password"), password is
  -- "password123" for all three -- local dev only, never do this in production.
  -- instance_id matches the local GoTrue default.

  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'admin@spiceroute.test', now(), '+911000000001', now(), crypt('password123', gen_salt('bf')),
    now(), now(), '{"provider":"email","providers":["email","phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_super_admin;

  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'manager@spiceroute.test', now(), '+911000000002', now(), crypt('password123', gen_salt('bf')),
    now(), now(), '{"provider":"email","providers":["email","phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_manager;

  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'cashier@spiceroute.test', now(), '+911000000003', now(), crypt('password123', gen_salt('bf')),
    now(), now(), '{"provider":"email","providers":["email","phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_cashier;

  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '+911000000004', now(), crypt(encode(gen_random_bytes(18), 'hex'), gen_salt('bf')),
    now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_waiter;

  -- Second waiter, seeded so tests/pgtap can exercise the transfer-approval flow.
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '+911000000006', now(), crypt(encode(gen_random_bytes(18), 'hex'), gen_salt('bf')),
    now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_waiter_2;

  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '+911000000005', now(), crypt(encode(gen_random_bytes(18), 'hex'), gen_salt('bf')),
    now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', false, false,
    '', '', '', '', '', '', '', ''
  ) returning id into v_auth_kitchen;

  insert into profiles (id, outlet_id, role_id, name, phone, pin_hash) values
    (v_auth_super_admin, v_outlet_id, v_role_super_admin, 'Anirudh Sharma', '+911000000001', hash_pin('1234')),
    (v_auth_manager, v_outlet_id, v_role_manager, 'Meera Iyer', '+911000000002', hash_pin('1234')),
    (v_auth_cashier, v_outlet_id, v_role_cashier, 'Sanjay Rao', '+911000000003', hash_pin('1234')),
    (v_auth_waiter, v_outlet_id, v_role_waiter, 'Ravi Kumar', '+911000000004', hash_pin('1234')),
    (v_auth_kitchen, v_outlet_id, v_role_kitchen, 'Chef Arjun', '+911000000005', hash_pin('1234')),
    (v_auth_waiter_2, v_outlet_id, v_role_waiter, 'Priya Nair', '+911000000006', hash_pin('1234'));

  insert into devices (outlet_id, user_id, platform, device_identifier) values
    (v_outlet_id, v_auth_waiter, 'android_waiter', 'dev-emulator-waiter-1'),
    (v_outlet_id, v_auth_kitchen, 'android_kitchen', 'dev-emulator-kitchen-1');
end $$;
