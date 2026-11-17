-- description: Back in operations before the key was handed back
-- table: work_orders
-- severity: warning
SELECT work_order_id FROM work_orders WHERE back_in_service_at < coalesce(key_out_at, closed_at)
