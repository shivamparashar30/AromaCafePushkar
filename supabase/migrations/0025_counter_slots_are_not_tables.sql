-- Counter slots are system plumbing, not tables.
--
-- They were visible in Live table ordering but hidden from Table structure, which read as
-- a bug: the same thing appearing in one table view and not the other. The reason they
-- were kept in live ordering was that an OPEN counter bill had nowhere else to be settled
-- -- the Bills page detail was read-only. With the Bills page now able to discount, take
-- payment, settle and void an open bill, a counter sale is raised and closed entirely
-- from Bills, and the slots no longer need to surface anywhere.
--
-- Consequence handled here: nothing can toggle is_active on a counter slot any more,
-- because nothing lists them. Two slots had been deactivated while they were still
-- listed, which left them permanently unusable -- create_walkin_bill required is_active,
-- so it would have minted Counter 4, 5, 6... for ever while the old ones sat orphaned.
--
-- The slot picker now ignores is_active for counters. deleted_at is still honoured, so a
-- retired slot stays retired.
do $patch$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_walkin_bill';

  if position('and t.is_active' in v_src) = 0 then
    raise notice 'create_walkin_bill already ignores is_active for counter slots';
    return;
  end if;

  v_src := replace(v_src, '    and t.is_active' || chr(10), '');

  execute format(
    'create or replace function public.create_walkin_bill('
    'p_items jsonb, p_customer_name text default null, p_customer_phone text default null) '
    'returns jsonb language plpgsql security definer set search_path = public as %L', v_src);
end
$patch$;

-- Recover the slots stranded by the removed UI.
update tables
set is_active = true
where is_counter and deleted_at is null and not is_active;
