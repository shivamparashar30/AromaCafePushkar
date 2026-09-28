begin;
select plan(5);

-- Fetch the QR tokens as the unrestricted test runner, BEFORE impersonating any customer --
-- a real customer never reads the tables table directly, they scan a printed/physical QR code.
select qr_token as t2_token from tables where name = 'T2' \gset
select qr_token as t3_token from tables where name = 'T3' \gset
select id as t2_id from tables where name = 'T2' \gset

-- Customer A scans table T2
select test_login_as_new_customer();
set local role authenticated;

select ok(
  resolve_qr(:'t2_token') is not null,
  'customer A can resolve T2''s QR and gets a table + menu + session back'
);

select is(
  (select count(*)::int from table_session_customers where customer_auth_id = auth.uid()),
  1,
  'customer A is bound to exactly one table session'
);

select ok(
  (select count(*)::int from menu_items) > 0,
  'customer A can see the outlet''s active menu'
);

select is(
  (select count(*)::int from profiles),
  0,
  'a customer can never see staff profiles'
);

-- Customer B scans a DIFFERENT table and must not see customer A's session
select test_login_as_new_customer();
set local role authenticated;
select resolve_qr(:'t3_token');

select is(
  (select count(*)::int from table_sessions where table_id = :'t2_id'::uuid),
  0,
  'customer B (on T3) cannot see customer A''s session on T2'
);

select * from finish();
rollback;
