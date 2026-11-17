-- description: Recall vehicle not in vehicles
-- table: recall_vehicles
-- needs: recall_vehicles, vehicles
-- severity: warning
SELECT r.vehicle_id FROM recall_vehicles r LEFT JOIN vehicles v USING (vehicle_id) WHERE v.vehicle_id IS NULL
