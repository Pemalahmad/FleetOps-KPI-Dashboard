-- description: Warranty for a vehicle not in vehicles
-- table: warranties
-- needs: warranties, vehicles
-- severity: warning
SELECT w.vehicle_id || ' ' || w.coverage FROM warranties w LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
