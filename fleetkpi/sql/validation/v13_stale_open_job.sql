-- description: Open for more than 60 days (check it is not a missing close date)
-- table: work_orders
-- severity: warning
SELECT work_order_id FROM work_orders
WHERE closed_at IS NULL AND opened_at < (SELECT max(opened_at) FROM work_orders) - INTERVAL 60 DAY
