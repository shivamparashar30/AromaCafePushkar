-- Backfill: orders left mid-flight on sessions that are already closed.
--
-- Before 0018, mark_paid settled the bill but never touched the order items, so every
-- table that paid left its items sitting at 'ready' (or 'ordered'/'cooking'). Those rows
-- were invisible while the kitchen query filtered to ['placed','cooking'], and surfaced
-- as a backlog of stale tickets -- 26 of them, some 33 hours old, all on closed sessions
-- with paid bills -- the moment 'ready' was added to that filter.
--
-- 0018 stops new ones appearing. This clears the ones already there, so the data says
-- what actually happened rather than the display merely hiding it. Runs through
-- apply_item_status so order_events and recompute_order_status stay consistent; the
-- actor is null because this is a system correction, not a person's action.
--
-- The kitchen query now also scopes to open sessions, so this class of row cannot reach
-- the display again even if some future path closes a session without settling items.
do $backfill$
declare
  v_items uuid[];
  v_orders int;
begin
  select array_agg(oi.id) into v_items
  from order_items oi
  join orders o on o.id = oi.order_id
  join table_sessions ts on ts.id = o.session_id
  where ts.status = 'closed'
    and oi.status not in ('served', 'cancelled');

  if v_items is null then
    raise notice 'nothing to settle';
    return;
  end if;

  perform apply_item_status(v_items, 'served'::order_item_status, null);

  select count(*) into v_orders
  from orders o
  join table_sessions ts on ts.id = o.session_id
  where ts.status = 'closed' and o.status in ('placed', 'cooking', 'ready');

  raise notice 'settled % items; % orders still unsettled on closed sessions',
    array_length(v_items, 1), v_orders;
end
$backfill$;
