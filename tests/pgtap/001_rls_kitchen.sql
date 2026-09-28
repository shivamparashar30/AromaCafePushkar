begin;
select plan(5);

select test_login_as('+911000000005'); -- Chef Arjun, kitchen
set local role authenticated;

select is(auth_role(), 'kitchen', 'kitchen JWT claim resolves via auth_role()');

select is(
  (select count(*)::int from bills),
  0,
  'kitchen cannot see any bills (no select policy grants kitchen access to bills)'
);

select ok(
  (select count(*)::int from menu_items) > 0,
  'kitchen CAN see the outlet''s menu (spec: menu view access for kitchen)'
);

update menu_items set price = 999999 where name = 'Masala Chai';
select is(
  (select price from menu_items where name = 'Masala Chai'),
  18000::bigint,
  'kitchen cannot update menu_items.price directly -- RLS blocks the write (0 rows affected)'
);

select is(
  (select count(*)::int from profiles),
  1,
  'kitchen can see only their own profile row, not the rest of the staff list'
);

select * from finish();
rollback;
