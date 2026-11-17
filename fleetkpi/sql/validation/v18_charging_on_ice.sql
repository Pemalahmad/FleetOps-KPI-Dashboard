-- description: Charging logged against a combustion (ICE) or hybrid (HEV) vehicle
-- table: energy
-- needs: energy, vehicles
-- severity: warning
SELECT DISTINCT e.vehicle_id FROM energy e JOIN vehicles v USING (vehicle_id)
WHERE v.powertrain IN ('ICE', 'HEV') AND e.energy_type = 'electricity'
