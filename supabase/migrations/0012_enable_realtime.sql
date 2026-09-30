-- Enable Supabase Realtime for the tables that need live updates across
-- Admin Dashboard, Kitchen App, Waiter App, and Customer App.
--
-- Supabase only broadcasts postgres_changes events for tables that belong
-- to the `supabase_realtime` publication. Without this, all .on('postgres_changes', …)
-- subscriptions silently receive nothing.

alter publication supabase_realtime add table tables;
alter publication supabase_realtime add table table_sessions;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table bills;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table menu_items;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table notifications;
