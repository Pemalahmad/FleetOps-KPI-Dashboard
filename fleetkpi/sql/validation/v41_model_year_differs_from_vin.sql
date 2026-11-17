-- description: Model year differs from the year encoded in the VIN (10th character); check which is right
-- table: vehicles
-- severity: warning
SELECT vehicle_id FROM vehicles
WHERE model_year IS NOT NULL AND vin_status(vin) = 'Valid'
  AND vin_model_year(vin, (SELECT value::TIMESTAMP::DATE FROM cfg_settings WHERE key = 'snapshot_ts')) <> model_year
