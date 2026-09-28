-- Automatic audit logging for price changes (discount/cancel/void/mark-paid audit rows are written
-- explicitly inside their RPC functions in 0010; price changes can happen via a direct admin
-- dashboard UPDATE, so they're caught here instead).

create or replace function audit_menu_item_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price then
    insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
    values (new.outlet_id, auth_profile_id(), 'price_change', 'menu_items', new.id,
            jsonb_build_object('price', old.price), jsonb_build_object('price', new.price));
  end if;
  return new;
end;
$$;

create trigger trg_menu_items_audit_price
  after update on menu_items
  for each row execute function audit_menu_item_price_change();

create or replace function audit_variant_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id uuid;
begin
  if new.price is distinct from old.price then
    select outlet_id into v_outlet_id from menu_items where id = new.item_id;
    insert into audit_logs (outlet_id, actor_id, action, entity, entity_id, before, after)
    values (v_outlet_id, auth_profile_id(), 'price_change', 'item_variants', new.id,
            jsonb_build_object('price', old.price), jsonb_build_object('price', new.price));
  end if;
  return new;
end;
$$;

create trigger trg_item_variants_audit_price
  after update on item_variants
  for each row execute function audit_variant_price_change();

-- Database webhooks to Edge Functions via pg_net. These read the target URL/service key from
-- Postgres settings that AREN'T set by this migration (no secrets belong in migrations) -- for
-- local dev run, e.g.:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'http://host.docker.internal:54321';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<local service_role key>';
-- In production, prefer Supabase's managed Database Webhooks (Dashboard or a webhooks migration)
-- over this trigger -- it's kept here so the wiring is visible and testable without the Dashboard.
-- Both triggers no-op silently when the settings are unset, so they're safe on a fresh database.

create or replace function notify_bill_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and v_url is not null and v_key is not null then
    perform net.http_post(
      url := v_url || '/functions/v1/send-bill',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('bill_id', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger trg_bills_notify_paid
  after update on bills
  for each row execute function notify_bill_paid();

create or replace function notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  if v_url is not null and v_key is not null then
    perform net.http_post(
      url := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := to_jsonb(new)
    );
  end if;
  return new;
end;
$$;

create trigger trg_notifications_send_push
  after insert on notifications
  for each row execute function notify_push();

-- Nightly rollup into daily_sales_summary (see 0007_misc.sql), scheduled via pg_cron at 00:15.

create or replace function fill_daily_sales_summary(p_date date default (current_date - 1))
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from daily_sales_summary where date = p_date;

  insert into daily_sales_summary (outlet_id, date, item_id, category_id, table_id, waiter_id, qty, amount)
  select oi.outlet_id, p_date, oi.item_id, mi.category_id, t.id, ts.waiter_id,
         sum(oi.qty), sum(oi.unit_price * oi.qty)
  from order_items oi
  join orders o on o.id = oi.order_id
  join table_sessions ts on ts.id = o.session_id
  join tables t on t.id = ts.table_id
  join menu_items mi on mi.id = oi.item_id
  where oi.status <> 'cancelled'
    and oi.created_at::date = p_date
  group by oi.outlet_id, oi.item_id, mi.category_id, t.id, ts.waiter_id;
end;
$$;

revoke execute on function fill_daily_sales_summary(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'daily-sales-summary') then
    perform cron.schedule('daily-sales-summary', '15 0 * * *', $job$select fill_daily_sales_summary(current_date - 1)$job$);
  end if;
end $$;
