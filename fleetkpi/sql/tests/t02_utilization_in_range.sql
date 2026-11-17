-- description: Utilisation is between 0 and 100% when hours are supplied
-- severity: error
SELECT * FROM mart_fleet_monthly WHERE utilization_pct NOT BETWEEN 0 AND 100
