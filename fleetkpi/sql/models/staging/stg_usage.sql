-- description: Distance and operating hours, daily or monthly
SELECT vehicle_id, date, date_trunc('month', date)::DATE AS month_start, km, operating_hours
FROM usage
