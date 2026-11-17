-- description: Registration and insurance status of the active fleet, by region
SELECT region, 'Registration' AS document, registration_status AS status, count(*) AS vehicles
FROM stg_vehicles WHERE is_active GROUP BY ALL
UNION ALL
SELECT region, 'Insurance', insurance_status, count(*)
FROM stg_vehicles WHERE is_active GROUP BY ALL
