-- description: Availability is a percentage between 0 and 100
-- severity: error
SELECT * FROM mart_fleet_monthly WHERE availability_pct NOT BETWEEN 0 AND 100
