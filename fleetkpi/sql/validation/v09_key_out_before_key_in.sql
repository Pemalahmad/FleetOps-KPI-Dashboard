-- description: Key handed back before it was handed in
-- table: work_orders
-- severity: error
SELECT work_order_id FROM work_orders
WHERE coalesce(key_out_at, closed_at) < coalesce(key_in_at, opened_at)
