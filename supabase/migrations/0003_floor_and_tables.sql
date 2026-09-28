create table floors (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_floors_updated_at
  before update on floors
  for each row execute function set_updated_at();

create table tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  floor_id uuid not null references floors(id) on delete restrict,
  name text not null,
  capacity int not null default 4,
  shape text not null default 'square',
  pos_x numeric,
  pos_y numeric,
  default_waiter_id uuid references profiles(id),
  status table_status not null default 'free',
  qr_token text not null,
  is_active boolean not null default true,
  -- per-table override of the outlet's global ordering-mode settings; null = inherit outlet default
  ordering_override jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, qr_token)
);

create trigger trg_tables_updated_at
  before update on tables
  for each row execute function set_updated_at();

create index idx_tables_outlet on tables(outlet_id);
create index idx_tables_floor on tables(floor_id);

-- One row per seating; parent of orders and the bill. A table has at most one OPEN session.

create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  table_id uuid not null references tables(id) on delete restrict,
  waiter_id uuid references profiles(id),
  status table_session_status not null default 'open',
  guest_count int,
  requires_order_confirmation boolean not null default false,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_table_sessions_updated_at
  before update on table_sessions
  for each row execute function set_updated_at();

create index idx_table_sessions_outlet on table_sessions(outlet_id);
create index idx_table_sessions_table on table_sessions(table_id);
create index idx_table_sessions_waiter on table_sessions(waiter_id);

-- Enforce "at most one OPEN session per table" at the DB level
create unique index uq_one_open_session_per_table
  on table_sessions(table_id)
  where (status = 'open');

-- Binds anonymous customer auth sessions to a table session. Many-to-one: "later scans on the same
-- table join the same session and cart (friends can order together)" -- each scanning phone gets its
-- own anonymous auth.uid(), and all of them read/write the same session through this join table.

create table table_session_customers (
  session_id uuid not null references table_sessions(id) on delete cascade,
  customer_auth_id uuid not null,
  name text,
  phone text,
  joined_at timestamptz not null default now(),
  primary key (session_id, customer_auth_id)
);

create index idx_table_session_customers_auth on table_session_customers(customer_auth_id);
