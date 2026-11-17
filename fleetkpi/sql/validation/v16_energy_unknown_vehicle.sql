-- description: Energy for a vehicle not in vehicles
-- table: energy
-- needs: energy, vehicles
-- severity: warning
SELECT DISTINCT e.vehicle_id FROM energy e LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
