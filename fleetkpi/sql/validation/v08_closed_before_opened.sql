-- description: Closed before it was opened
-- table: work_orders
-- severity: error
SELECT work_order_id FROM work_orders WHERE closed_at < opened_at
