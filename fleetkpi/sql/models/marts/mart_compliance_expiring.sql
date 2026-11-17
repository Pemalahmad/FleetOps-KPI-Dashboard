-- description: Active vehicles whose registration or insurance is expired or expiring, most urgent first
SELECT vehicle_id, region, home_site_id, 'Registration' AS document, registration_status AS status,
       registration_expiry AS expiry_date, registration_days_left AS days_left, NULL AS insurer
FROM stg_vehicles WHERE is_active AND registration_status IN ('Expired', 'Expiring')
UNION ALL
SELECT vehicle_id, region, home_site_id, 'Insurance', insurance_status,
       insurance_expiry, insurance_days_left, insurer
FROM stg_vehicles WHERE is_active AND insurance_status IN ('Expired', 'Expiring')
ORDER BY days_left
