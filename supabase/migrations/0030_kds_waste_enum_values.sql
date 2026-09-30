-- Kitchen display gains a Wasted state (spoiled, dropped, burnt, returned).
--
-- Enum values must be added in their own migration: Postgres allows ALTER TYPE ... ADD
-- VALUE inside a transaction, but the new label cannot be *used* until that transaction
-- commits. Everything that reads or writes 'wasted' therefore lives in 0031.
alter type order_item_status add value if not exists 'wasted';
alter type order_status      add value if not exists 'wasted';
