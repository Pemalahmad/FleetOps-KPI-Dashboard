-- description: Duplicate part_order_id
-- table: parts_orders
-- severity: error
SELECT part_order_id FROM parts_orders GROUP BY 1 HAVING count(*) > 1
