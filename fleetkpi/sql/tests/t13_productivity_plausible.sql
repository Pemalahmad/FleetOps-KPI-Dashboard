-- description: Productivity above 150% suggests technician headcount is understated
-- severity: warn
SELECT site_name, month_start FROM mart_productivity WHERE productivity_pct > 150 AND available_hours > 0
