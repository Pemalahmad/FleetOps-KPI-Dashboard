-- description: Usage for a vehicle not in vehicles
-- table: usage
-- needs: usage, vehicles
-- severity: warning
SELECT DISTINCT u.vehicle_id FROM usage u LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
