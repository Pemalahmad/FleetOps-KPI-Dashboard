-- description: Recall completions never exceed affected vehicles
-- severity: error
SELECT campaign_id, region FROM mart_recall_completion WHERE completed_vehicles > affected_vehicles
