-- Enum values for the kitchen display redesign.
--
-- Enum values must be added in their own migration: Postgres allows ALTER TYPE ... ADD
-- VALUE inside a transaction, but the new label cannot be *used* until that transaction
-- commits. Everything that uses these lives in 0038.
--
-- kitchen_message: the kitchen can now send a short note to a table's waiter ("running
-- late", "out of paneer") instead of shouting across the pass.
alter type notification_event add value if not exists 'kitchen_message';

-- 'wasted': 0036 made cancel_item compare against order_item_status 'wasted', but the
-- migration that created that label (0030, on the Kitchen-Tab-UI branch) never reached
-- main. Without the label every cancel_item call fails with "invalid input value for
-- enum". IF NOT EXISTS keeps this a no-op on a database that did get 0030.
alter type order_item_status add value if not exists 'wasted';
