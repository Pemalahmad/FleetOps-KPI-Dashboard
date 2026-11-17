-- description: Part arrived before it was ordered
-- table: parts_orders
-- severity: error
SELECT part_order_id FROM parts_orders WHERE arrived_at < ordered_at
