-- description: Every alert names a known vehicle or driver
-- severity: error
SELECT a.subject_id FROM mart_alerts a
LEFT JOIN stg_vehicles v ON a.subject_type = 'vehicle' AND v.vehicle_id = a.subject_id
LEFT JOIN stg_drivers d ON a.subject_type = 'driver' AND d.driver_id = a.subject_id
WHERE v.vehicle_id IS NULL AND d.driver_id IS NULL
