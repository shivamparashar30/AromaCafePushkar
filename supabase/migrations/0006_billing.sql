-- Backing counter for gap-free sequential bill numbers per outlet per financial year.
-- Not in the spec's table list explicitly, but required for "sequential with no gaps" numbering;
-- create_bill()/mark_paid() takes a row lock here (SELECT ... FOR UPDATE) before allocating a number.

create table bill_counters (
  outlet_id uuid not null references outlets(id) on delete cascade,
  financial_year text not null, -- e.g. '2026-27'
  next_number int not null default 1,
  primary key (outlet_id, financial_year)
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  session_id uuid not null references table_sessions(id) on delete restrict,
  customer_id uuid references customers(id),
  bill_no text, -- assigned only when finalised (status moves to 'paid'); null while open
  subtotal bigint not null default 0,
  discount bigint not null default 0,
  discount_reason text,
  discount_by uuid references profiles(id),
  service_charge bigint not null default 0,
  tax_total bigint not null default 0,
  round_off bigint not null default 0,
  total bigint not null default 0,
  status bill_status not null default 'open',
  void_reason text,
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, bill_no)
);

create trigger trg_bills_updated_at
  before update on bills
  for each row execute function set_updated_at();

create index idx_bills_outlet_created on bills(outlet_id, created_at);
create index idx_bills_session on bills(session_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  mode payment_mode not null,
  amount bigint not null,
  reference text,
  gateway_payment_id text,
  marked_by uuid references profiles(id),
  status payment_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  constraint chk_payment_amount_positive check (amount > 0)
);

create index idx_payments_bill on payments(bill_id);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  phone text not null,
  template text not null,
  wa_message_id text,
  status whatsapp_status not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_whatsapp_messages_updated_at
  before update on whatsapp_messages
  for each row execute function set_updated_at();

create index idx_whatsapp_messages_bill on whatsapp_messages(bill_id);
