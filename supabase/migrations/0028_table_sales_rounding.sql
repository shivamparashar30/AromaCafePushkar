-- v_table_sales returned the raw average, so the UI printed values like
-- 3.2901907181818184 min. Rounded at the source so every consumer gets a sane number,
-- rather than relying on each caller to format it.
--
-- Counter slots are also excluded. This view backs "Table utilisation", and a counter
-- sale has no turnaround to speak of (0.39 min in practice) because nobody sits at it --
-- it is a till, not a table. Their revenue still counts in Net revenue and Bills, which
-- read from bills directly; only the per-table utilisation breakdown drops them.
create or replace view v_table_sales as
  select b.outlet_id,
         t.id   as table_id,
         t.name as table_name,
         count(distinct b.id) as bills,
         sum(b.total) as revenue,
         round(
           avg(extract(epoch from ts.closed_at - ts.opened_at) / 60::numeric),
           2
         ) as avg_turnaround_minutes
  from bills b
    join table_sessions ts on ts.id = b.session_id
    join tables t on t.id = ts.table_id
  where b.status = 'paid'::bill_status
    and not t.is_counter
  group by b.outlet_id, t.id, t.name;
