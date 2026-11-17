-- description: Duplicate work_order_id
-- table: work_orders
-- severity: error
SELECT work_order_id FROM work_orders GROUP BY 1 HAVING count(*) > 1
