-- description: North American VIN whose 9th-character check digit does not match (likely a typo)
-- table: vehicles
-- severity: warning
SELECT vehicle_id FROM vehicles WHERE vin_status(vin) = 'Check digit mismatch'
