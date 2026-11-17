-- description: Every ranked site has an Ops Score between 0 and 1,000 and a tier
-- severity: error
SELECT site_name FROM mart_leaderboard WHERE tier IS NULL OR ops_score NOT BETWEEN 0 AND 1000
