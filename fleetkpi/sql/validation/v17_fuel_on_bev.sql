-- description: Fuel logged against an electric (BEV) vehicle
-- table: energy
-- needs: energy, vehicles
-- severity: warning
SELECT DISTINCT e.vehicle_id FROM energy e JOIN vehicles v USING (vehicle_id)
WHERE v.powertrain = 'BEV' AND e.energy_type = 'fuel'
