-- Reference data the UI was retyping as literals now comes from the database.
--
-- 1. Enum dropdowns (payment modes, booking status/source, bill status, food types) were
--    hard-coded <SelectItem> lists. Add a value to an enum and the app silently kept
--    offering the old set -- the counter bill dialog was already wrong, offering 3 of the
--    5 payment modes.
-- 2. The restaurant name was hard-coded in 9 places across the three apps while
--    outlets.name sat right here. Signed-in surfaces read outlets directly, but the admin
--    login screen and the customer landing page run before any session exists, so they
--    need a public endpoint.

create or replace function list_enum_values(p_enum text)
returns table (value text, sort_order int)
language sql stable
security definer
set search_path = public, pg_catalog
as $$
  select e.enumlabel::text, e.enumsortorder::int
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = p_enum
  order by e.enumsortorder;
$$;

grant execute on function list_enum_values(text) to authenticated;

-- Exposes only the outlet's public identity -- the same name already printed on every QR
-- landing page and bill -- and nothing else from the settings blob.
create or replace function public_outlet_info()
returns table (id uuid, name text)
language sql stable
security definer
set search_path = public
as $$
  select o.id, o.name from outlets o order by o.created_at limit 1;
$$;

grant execute on function public_outlet_info() to anon, authenticated;
