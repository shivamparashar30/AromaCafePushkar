create table bookings (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  customer_id uuid references customers(id),
  name text not null,
  phone text not null,
  party_size int not null default 2,
  starts_at timestamptz not null,
  table_ids uuid[] not null default '{}',
  status booking_status not null default 'booked',
  source booking_source not null default 'phone',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create index idx_bookings_outlet_starts on bookings(outlet_id, starts_at);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz
);

create index idx_attendance_user on attendance(user_id);

-- Immutable audit log for every sensitive action (discount, cancel, void, price change, mark paid).
-- Populated by triggers/RPC functions; no update or delete policy is ever granted.

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_outlet_created on audit_logs(outlet_id, created_at);
create index idx_audit_logs_entity on audit_logs(entity, entity_id);

-- Nightly rollup for fast yearly reports (filled by a pg_cron job, see 0012_triggers.sql)

create table daily_sales_summary (
  outlet_id uuid not null references outlets(id) on delete cascade,
  date date not null,
  item_id uuid references menu_items(id),
  category_id uuid references categories(id),
  table_id uuid references tables(id),
  waiter_id uuid references profiles(id),
  qty int not null default 0,
  amount bigint not null default 0,
  primary key (outlet_id, date, item_id, table_id, waiter_id)
);

create index idx_daily_sales_summary_outlet_date on daily_sales_summary(outlet_id, date);

-- Live alert feed backing the spec's "Notifications and alert sounds" table (ready alerts, call
-- waiter, bill requested, new unassigned table, etc). Clients subscribe via Postgres Changes;
-- an AFTER INSERT trigger (0011) also relays each row to the send-push Edge Function for FCM.
-- target_user_id = null means "broadcast to all on-duty staff in the outlet/area" (e.g. an
-- unclaimed table's alert, or a manager-facing dashboard banner).

create table notifications (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  event notification_event not null,
  table_id uuid references tables(id),
  session_id uuid references table_sessions(id),
  target_user_id uuid references profiles(id),
  payload jsonb not null default '{}'::jsonb,
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_outlet_created on notifications(outlet_id, created_at);
create index idx_notifications_target on notifications(target_user_id);
