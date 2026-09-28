begin;
select plan(6);

select test_login_as('+911000000004'); -- Ravi Kumar, waiter
set local role authenticated;

select is(auth_role(), 'waiter', 'waiter JWT claim resolves via auth_role()');
select is((select count(*)::int from profiles), 1, 'waiter sees only their own profile row');

select ok(
  claim_table((select id from tables where name = 'T1')) is not null,
  'waiter can claim an unassigned table via claim_table()'
);

select is(
  (select waiter_id from table_sessions where table_id = (select id from tables where name = 'T1')),
  auth_profile_id(),
  'claiming the table assigns the calling waiter'
);

-- A second waiter cannot take the same table without approval (current waiter/manager, or the
-- allow_direct_table_takeover setting, which is off in the seeded outlet).
select test_login_as('+911000000006'); -- Priya Nair, second waiter
set local role authenticated;

select throws_ok(
  $$ select transfer_table((select id from tables where name = 'T1')) $$,
  'P0001',
  'Transfer needs approval from the current waiter or a manager (or enable direct takeover)',
  'a second waiter cannot take over an already-claimed table without approval'
);

-- A manager can force the reassignment directly
select test_login_as('+911000000002'); -- Meera Iyer, manager
set local role authenticated;

select lives_ok(
  $$ select transfer_table((select id from tables where name = 'T1'), (select id from profiles where phone = '+911000000006')) $$,
  'a manager can reassign a table directly, bypassing the approval requirement'
);

select * from finish();
rollback;
