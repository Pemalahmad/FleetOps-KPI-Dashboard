-- description: Powertrain not recorded yet (energy, cost per km and PM intervals skip the vehicle until it is)
-- table: vehicles
-- severity: warning
SELECT vehicle_id FROM vehicles WHERE powertrain IS NULL
