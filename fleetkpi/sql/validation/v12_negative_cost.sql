-- description: Negative cost
-- table: work_orders
-- severity: warning
SELECT work_order_id FROM work_orders WHERE total_cost < 0
