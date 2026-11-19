-- description: Every warranty ends after it starts and has a known status, and every add-on belongs to a known vehicle position
-- severity: error
SELECT vehicle_id || ' ' || coverage FROM stg_warranties
WHERE end_date < start_date OR warranty_status NOT IN ('Active', 'Expiring', 'Expired', 'Expired (km)', 'Void')
UNION ALL
SELECT vehicle_id FROM mart_vehicle_warranty
WHERE warranty_position NOT IN ('Covered', 'Expiring', 'Partly covered', 'Out of warranty', 'Unknown') OR addons < 0
