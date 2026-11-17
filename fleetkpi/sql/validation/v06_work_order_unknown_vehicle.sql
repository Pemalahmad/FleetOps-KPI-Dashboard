-- description: Work order for a vehicle not in vehicles
-- table: work_orders
-- needs: work_orders, vehicles
-- severity: error
SELECT w.work_order_id || ' -> ' || w.vehicle_id
FROM work_orders w LEFT JOIN vehicles v USING (vehicle_id)
WHERE v.vehicle_id IS NULL
