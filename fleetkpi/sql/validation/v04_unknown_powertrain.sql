-- description: Powertrain not recognised (use BEV, PHEV, HEV or ICE)
-- table: vehicles
-- severity: error
SELECT vehicle_id || ' = ' || coalesce(powertrain, 'blank') FROM vehicles
WHERE powertrain IS NULL OR powertrain NOT IN ('BEV', 'PHEV', 'HEV', 'ICE')
