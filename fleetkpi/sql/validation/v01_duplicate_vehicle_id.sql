-- description: Duplicate vehicle_id
-- table: vehicles
-- severity: error
SELECT vehicle_id FROM vehicles GROUP BY 1 HAVING count(*) > 1
