-- description: int_vehicle_months has exactly one row per vehicle per month
-- severity: error
SELECT vehicle_id, month_start FROM int_vehicle_months GROUP BY ALL HAVING count(*) > 1
