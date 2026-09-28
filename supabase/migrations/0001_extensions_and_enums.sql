-- Extensions
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_cron" with schema extensions;
create extension if not exists "pg_net" with schema extensions;

-- Enums

create type app_role as enum (
  'super_admin',
  'manager',
  'cashier',
  'waiter',
  'kitchen'
);

create type table_status as enum (
  'free',
  'occupied',
  'bill_requested',
  'paid',
  'cleaning',
  'reserved'
);

create type table_session_status as enum (
  'open',
  'closed'
);

create type food_type as enum (
  'veg',
  'non_veg',
  'egg'
);

create type order_source as enum (
  'customer',
  'waiter',
  'admin'
);

-- order status is derived from its items, but stored for fast reads
create type order_status as enum (
  'placed',
  'cooking',
  'ready',
  'served',
  'cancelled'
);

create type order_item_status as enum (
  'ordered',
  'cooking',
  'ready',
  'served',
  'cancelled'
);

create type bill_status as enum (
  'open',
  'paid',
  'void'
);

create type payment_mode as enum (
  'cash',
  'upi',
  'card',
  'online',
  'other'
);

create type payment_status as enum (
  'pending',
  'confirmed',
  'failed',
  'refunded'
);

create type whatsapp_status as enum (
  'queued',
  'sent',
  'delivered',
  'read',
  'failed'
);

create type booking_status as enum (
  'booked',
  'arrived',
  'no_show',
  'cancelled'
);

create type booking_source as enum (
  'phone',
  'walk_in',
  'website'
);

create type device_platform as enum (
  'android_waiter',
  'android_kitchen',
  'web_admin'
);

create type notification_event as enum (
  'order_ready',
  'call_waiter',
  'bill_requested',
  'new_unassigned_table',
  'item_cancelled',
  'order_waiting_too_long',
  'whatsapp_failed',
  'booking_arriving'
);

-- Reusable trigger to keep updated_at current
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
