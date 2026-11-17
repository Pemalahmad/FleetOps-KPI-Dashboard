-- description: The panel's exact availability agrees with the published availability KPI (to its 2-decimal rounding)
-- severity: error
SELECT p.region, p.month_start FROM mart_metric_panel p
JOIN mart_fleet_monthly f USING (region, month_start)
WHERE abs(p.availability_exact_pct - f.availability_pct) > 0.0051
