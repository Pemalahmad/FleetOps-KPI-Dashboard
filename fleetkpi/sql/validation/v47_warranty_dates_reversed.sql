-- description: Warranty ends before it starts
-- table: warranties
-- needs: warranties
-- severity: error
SELECT vehicle_id || ' ' || coverage FROM warranties WHERE end_date < start_date
