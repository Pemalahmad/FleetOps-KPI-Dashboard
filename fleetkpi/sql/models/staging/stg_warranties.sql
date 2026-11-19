-- description: Warranty cover per vehicle with its status by date and by kilometres (Active, Expiring, Expired, Expired (km), Void), days and km left
-- materialized: table
WITH km AS (SELECT vehicle_id, sum(km) AS km_driven FROM stg_usage GROUP BY 1)
SELECT w.vehicle_id, w.coverage, w.provider, w.start_date, w.end_date, w.km_limit, w.contract_number,
       coalesce(k.km_driven, 0) AS km_driven,
       date_diff('day', snapshot_date(), w.end_date) AS days_left,
       w.km_limit - coalesce(k.km_driven, 0) AS km_left,
       CASE WHEN w.status = 'Void' THEN 'Void'
            WHEN w.end_date < snapshot_date() THEN 'Expired'
            WHEN w.km_limit IS NOT NULL AND coalesce(k.km_driven, 0) >= w.km_limit THEN 'Expired (km)'
            WHEN w.end_date <= snapshot_date() + INTERVAL 90 DAY
              OR (w.km_limit IS NOT NULL AND w.km_limit - coalesce(k.km_driven, 0) < 5000) THEN 'Expiring'
            ELSE 'Active' END AS warranty_status,
       v.region, v.make, v.model, v.powertrain
FROM warranties w
LEFT JOIN km k USING (vehicle_id)
LEFT JOIN stg_vehicles v USING (vehicle_id)
