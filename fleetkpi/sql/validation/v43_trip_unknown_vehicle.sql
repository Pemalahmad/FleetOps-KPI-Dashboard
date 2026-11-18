-- description: Trip for a vehicle not in vehicles
-- table: trips
-- needs: trips, vehicles
-- severity: warning
SELECT coalesce(t.trip_id, '?') || ' -> ' || t.vehicle_id FROM trips t LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
