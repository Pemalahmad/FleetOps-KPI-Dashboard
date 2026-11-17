-- description: Parts order for a work order not in work_orders
-- table: parts_orders
-- needs: parts_orders, work_orders
-- severity: warning
SELECT p.part_order_id || ' -> ' || p.work_order_id FROM parts_orders p
LEFT JOIN work_orders w USING (work_order_id) WHERE w.work_order_id IS NULL
