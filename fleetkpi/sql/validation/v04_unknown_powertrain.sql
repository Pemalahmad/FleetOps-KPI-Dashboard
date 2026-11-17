-- description: Powertrain not recognised (use BEV, PHEV, HEV or ICE)
-- table: vehicles
-- severity: error
SELECT vehicle_id || ' = ' || powertrain FROM vehicles
WHERE powertrain IS NOT NULL AND powertrain NOT IN ('BEV', 'PHEV', 'HEV', 'ICE')
