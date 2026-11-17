-- description: Negative distance
-- table: usage
-- severity: warning
SELECT vehicle_id || ' ' || date FROM usage WHERE km < 0
