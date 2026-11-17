-- description: Fine for a vehicle not in vehicles
-- table: fines
-- needs: fines, vehicles
-- severity: warning
SELECT f.fine_id || ' -> ' || f.vehicle_id FROM fines f LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
