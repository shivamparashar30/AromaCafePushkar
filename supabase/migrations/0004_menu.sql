create table tax_groups (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  cgst_percent numeric(5,2) not null default 0,
  sgst_percent numeric(5,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create trigger trg_tax_groups_updated_at
  before update on tax_groups
  for each row execute function set_updated_at();

create table categories (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  name text not null,
  image_url text,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  available_from time,
  available_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index idx_categories_outlet on categories(outlet_id);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  tax_group_id uuid references tax_groups(id),
  name text not null,
  description text,
  price bigint not null, -- paise; base price when no variants
  image_urls text[] not null default '{}',
  food_type food_type not null default 'veg',
  station text,
  prep_minutes int not null default 15,
  spice_level int,
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  sort_order int not null default 0,
  in_stock boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_price_nonnegative check (price >= 0)
);

create trigger trg_menu_items_updated_at
  before update on menu_items
  for each row execute function set_updated_at();

create index idx_menu_items_outlet on menu_items(outlet_id);
create index idx_menu_items_category on menu_items(category_id);

create table item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references menu_items(id) on delete cascade,
  name text not null, -- Half / Full, Small / Large
  price bigint not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  constraint chk_variant_price_nonnegative check (price >= 0)
);

create index idx_item_variants_item on item_variants(item_id);

create table addon_groups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  min_select int not null default 0,
  max_select int not null default 1,
  sort_order int not null default 0
);

create index idx_addon_groups_item on addon_groups(item_id);

create table addons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references addon_groups(id) on delete cascade,
  name text not null,
  price bigint not null default 0,
  is_active boolean not null default true,
  constraint chk_addon_price_nonnegative check (price >= 0)
);

create index idx_addons_group on addons(group_id);
