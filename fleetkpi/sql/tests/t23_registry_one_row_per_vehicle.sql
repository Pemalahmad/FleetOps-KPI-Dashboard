-- description: The fleet register has exactly one row per vehicle
-- severity: error
SELECT 'count' FROM (SELECT (SELECT count(*) FROM mart_fleet_registry) AS a, (SELECT count(*) FROM vehicles) AS b) WHERE a <> b
UNION ALL
SELECT vehicle_id FROM mart_fleet_registry GROUP BY 1 HAVING count(*) > 1
