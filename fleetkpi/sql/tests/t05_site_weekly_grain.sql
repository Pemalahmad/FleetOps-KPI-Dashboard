-- description: int_site_weekly has exactly one row per site per week
-- severity: error
SELECT site_id, wk FROM int_site_weekly GROUP BY ALL HAVING count(*) > 1
