-- Waiters could not mark an item served, which is the one status transition that is
-- actually their job.
--
-- The old guard was:
--     if not ((auth_role() = 'kitchen' and has_permission('item_status_update'))
--             or auth_role() in ('super_admin', 'manager')) then
--       raise exception 'Not permitted to update item status';
--
-- and 0002 grants item_status_update to the kitchen role only:
--     (v_waiter, 'orders_place'), (v_waiter, 'bill_mark_paid'), (v_waiter, 'reports_view_own');
--     (v_kitchen, 'item_status_update');
--
-- So the Serve button in the waiter app always failed with "Not permitted to update item
-- status", and nothing but an admin or manager could move a ready ticket to served. That
-- is also why ready tickets had no way off the kitchen display: the role meant to clear
-- them was the one role forbidden from doing it.
--
-- The transition is now scoped by who owns that step of the workflow:
--   super_admin / manager  -> any status (supervisory override)
--   kitchen                -> cooking, ready      (it cooks; it does not carry plates)
--   waiter / cashier       -> served              (it carries plates; it does not cook)
--
-- Note this also removes the kitchen's previously unrestricted ability to set 'served'.
-- No client sent that transition -- the kitchen app only ever calls cooking and ready --
-- and the cross button on a ready ticket is a display-only dismissal, not a state change.
create or replace function set_item_status(p_item_ids uuid[], p_status order_item_status)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role app_role := auth_role();
begin
  if exists (select 1 from order_items oi where oi.id = any(p_item_ids) and not is_staff(oi.outlet_id)) then
    raise exception 'Not your outlet';
  end if;

  if v_role in ('super_admin', 'manager') then
    null; -- full control

  elsif v_role = 'kitchen' then
    if not has_permission('item_status_update') then
      raise exception 'Not permitted to update item status';
    end if;
    if p_status not in ('cooking', 'ready') then
      raise exception 'The kitchen can move items to cooking or ready only. A waiter marks them served.';
    end if;

  elsif v_role in ('waiter', 'cashier') then
    if p_status <> 'served' then
      raise exception 'A waiter can only mark items served. The kitchen updates cooking and ready.';
    end if;

  else
    raise exception 'Not permitted to update item status';
  end if;

  perform apply_item_status(p_item_ids, p_status, auth_profile_id());
end;
$$;

grant execute on function set_item_status(uuid[], order_item_status) to authenticated;
