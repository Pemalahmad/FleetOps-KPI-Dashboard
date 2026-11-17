-- description: Promised ETA earlier than the order date
-- table: parts_orders
-- severity: warning
SELECT part_order_id FROM parts_orders WHERE promised_eta < ordered_at
