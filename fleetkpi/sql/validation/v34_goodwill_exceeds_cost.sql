-- description: Goodwill larger than the job cost, or negative
-- table: work_orders
-- severity: warning
SELECT work_order_id FROM work_orders WHERE goodwill_amount < 0 OR goodwill_amount > total_cost
