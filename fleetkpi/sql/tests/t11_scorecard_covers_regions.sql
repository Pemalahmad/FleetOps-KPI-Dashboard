-- description: The executive scorecard has a row for every region active in the report month
-- severity: error
SELECT DISTINCT region FROM int_vehicle_months WHERE month_start = report_month()
EXCEPT SELECT region FROM mart_exec_scorecard
