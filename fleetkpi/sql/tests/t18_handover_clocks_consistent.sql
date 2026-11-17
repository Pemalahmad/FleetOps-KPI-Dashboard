-- description: The clocks add up: key-in to back-in-service equals workshop + pick-up + back-to-operations
-- severity: error
SELECT work_order_id FROM stg_work_orders
WHERE back_in_service_ts IS NOT NULL
  AND abs(off_road_h - (workshop_h + time_to_pickup_h + back_to_ops_h)) > 0.02
