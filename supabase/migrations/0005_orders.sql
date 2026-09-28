create table customers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  phone text not null,
  name text,
  whatsapp_opt_in boolean not null default false,
  visits int not null default 0,
  total_spend bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, phone)
);

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- One row per "send to kitchen" (a KOT). A table session can have many orders (initial + add-ons).

create table orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  session_id uuid not null references table_sessions(id) on delete restrict,
  source order_source not null,
  placed_by uuid references profiles(id), -- null when source = 'customer'
  status order_status not null default 'placed',
  kot_number int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index idx_orders_outlet on orders(outlet_id);
create index idx_orders_session on orders(session_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references menu_items(id),
  variant_id uuid references item_variants(id),
  qty int not null default 1,
  unit_price bigint not null, -- price copied at order time (item or variant + no addons)
  notes text,
  status order_item_status not null default 'ordered',
  station text,
  cancel_reason text,
  cancelled_by uuid references profiles(id),
  cooked_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_qty_positive check (qty > 0)
);

create trigger trg_order_items_updated_at
  before update on order_items
  for each row execute function set_updated_at();

create index idx_order_items_outlet on order_items(outlet_id);
create index idx_order_items_order on order_items(order_id);
create index idx_order_items_status_station on order_items(status, station);
create index idx_order_items_item_created on order_items(item_id, created_at);

create table order_item_addons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  addon_id uuid not null references addons(id),
  price bigint not null default 0 -- price copied at order time
);

create index idx_order_item_addons_item on order_item_addons(order_item_id);

-- Audit trail of every status transition, per order or per item, for timing reports and disputes.

create table order_events (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references profiles(id),
  at timestamptz not null default now()
);

create index idx_order_events_order on order_events(order_id);
create index idx_order_events_item on order_events(order_item_id);
