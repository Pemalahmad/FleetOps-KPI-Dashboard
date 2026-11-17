-- description: VIN is not 17 characters of A-Z / 0-9 (I, O and Q are never used)
-- table: vehicles
-- severity: warning
SELECT vehicle_id FROM vehicles WHERE vin IS NOT NULL AND vin_status(vin) = 'Invalid format'
