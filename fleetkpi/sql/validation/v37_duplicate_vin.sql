-- description: The same VIN on more than one vehicle
-- table: vehicles
-- severity: warning
SELECT vin FROM vehicles WHERE vin IS NOT NULL GROUP BY vin HAVING count(*) > 1
