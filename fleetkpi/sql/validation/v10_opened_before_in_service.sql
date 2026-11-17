-- description: Opened before the vehicle entered service
-- table: work_orders
-- needs: work_orders, vehicles
-- severity: warning
SELECT w.work_order_id FROM work_orders w JOIN vehicles v USING (vehicle_id)
WHERE w.opened_at::DATE < v.in_service_date
