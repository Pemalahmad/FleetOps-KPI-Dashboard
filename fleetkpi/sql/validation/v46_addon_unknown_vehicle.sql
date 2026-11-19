-- description: Add-on for a vehicle not in vehicles
-- table: vehicle_addons
-- needs: vehicle_addons, vehicles
-- severity: warning
SELECT a.vehicle_id || ' ' || a.addon FROM vehicle_addons a LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
