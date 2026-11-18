-- description: Every driver safety score is between 0 and 100, and rates are never negative
-- severity: error
SELECT driver_id FROM mart_driver_scores
WHERE safety_score NOT BETWEEN 0 AND 100 OR speeding_per_100km < 0 OR harsh_per_100km < 0 OR idle_pct NOT BETWEEN 0 AND 100
