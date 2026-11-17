-- description: Executive scorecard: one row per region for the report month, every KPI with its RAG status
WITH cur AS (SELECT * FROM mart_region_month_kpis WHERE month_start = report_month()),
pm AS (SELECT region, 100.0 * sum(vehicles - overdue) / sum(vehicles) AS pm_compliance_pct FROM mart_pm_compliance GROUP BY ALL),
docs AS (
    SELECT region,
           100.0 * sum(vehicles) FILTER (WHERE document = 'Registration' AND status IN ('Valid', 'Expiring'))
                 / nullif(sum(vehicles) FILTER (WHERE document = 'Registration' AND status <> 'Unknown'), 0) AS registration_valid_pct,
           100.0 * sum(vehicles) FILTER (WHERE document = 'Insurance' AND status IN ('Valid', 'Expiring'))
                 / nullif(sum(vehicles) FILTER (WHERE document = 'Insurance' AND status <> 'Unknown'), 0)    AS insurance_valid_pct
    FROM mart_compliance_status GROUP BY ALL
),
bl AS (SELECT region, sum(open_jobs) / nullif(sum(daily_closures), 0) AS backlog_days FROM mart_backlog GROUP BY ALL),
econ AS (
    SELECT region,
           (sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0) AS tco_per_km,
           1000 * sum(co2_kg) / nullif(sum(km), 0)                                             AS co2_g_per_km
    FROM int_vehicle_month_economics GROUP BY ALL
)
SELECT c.region, c.month_start, c.active_vehicles,
       c.availability_pct,                     rag('availability_pct', c.availability_pct)               AS availability_rag,
       c.utilization_pct,                      rag('utilization_pct', c.utilization_pct)                 AS utilization_rag,
       c.key_to_key_p50_h,                     rag('key_to_key_p50_h', c.key_to_key_p50_h)               AS key_to_key_rag,
       c.first_time_fix_pct,                   rag('first_time_fix_pct', c.first_time_fix_pct)           AS first_time_fix_rag,
       c.productivity_pct,                     rag('productivity_pct', c.productivity_pct)               AS productivity_rag,
       round(bl.backlog_days, 2) AS backlog_days, rag('backlog_days', bl.backlog_days)                   AS backlog_rag,
       c.csat_pct,                             rag('csat_pct', c.csat_pct)                               AS csat_rag,
       c.low_rating_pct,                       rag('low_rating_pct', c.low_rating_pct)                   AS low_rating_rag,
       round(pm.pm_compliance_pct, 1) AS pm_compliance_pct, rag('pm_compliance_pct', pm.pm_compliance_pct) AS pm_rag,
       round(d.registration_valid_pct, 1) AS registration_valid_pct, rag('registration_valid_pct', d.registration_valid_pct) AS registration_rag,
       round(d.insurance_valid_pct, 1) AS insurance_valid_pct, rag('insurance_valid_pct', d.insurance_valid_pct) AS insurance_rag,
       c.cost_vs_budget_pct,                   rag('cost_vs_budget_pct', c.cost_vs_budget_pct)           AS cost_rag,
       c.recall_completion_pct,                rag('recall_completion_pct', c.recall_completion_pct)     AS recall_rag,
       round(e.tco_per_km, 4) AS tco_per_km, round(e.co2_g_per_km, 1) AS co2_g_per_km
FROM cur c
LEFT JOIN pm USING (region)
LEFT JOIN docs d USING (region)
LEFT JOIN bl USING (region)
LEFT JOIN econ e USING (region)
ORDER BY c.active_vehicles DESC
