-- description: Service spend per vehicle reconciles to work orders on active vehicles
-- severity: error
SELECT 1 WHERE abs((SELECT sum(total_service_spend) FROM mart_vehicle_service_spend)
                 - (SELECT coalesce(sum(w.total_cost), 0) FROM stg_work_orders w
                    JOIN stg_vehicles v USING (vehicle_id) WHERE v.is_active))
           > (SELECT count(*) FROM mart_vehicle_service_spend) * 0.5
