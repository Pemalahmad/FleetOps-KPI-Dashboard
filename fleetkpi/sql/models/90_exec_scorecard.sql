-- Executive scorecard: one row per region for the report month, every KPI with its RAG.

CREATE OR REPLACE VIEW region_month_kpis AS
WITH service AS (
    SELECT vehicle_region AS region, date_trunc('month', closed_at)::DATE AS month_start,
           median(turnaround_h)               AS turnaround_p50_h,
           100 * (1 - avg(repeat_visit::INT)) AS first_time_fix_pct
    FROM wo WHERE job_type <> 'Recall' AND closed_at IS NOT NULL
    GROUP BY ALL
),
recall AS (
    -- completion across campaigns launched at least 8 weeks before month end
    SELECT v.region, mo.month_start,
           100.0 * count(DISTINCT w.campaign_id || w.vehicle_id)
                 / nullif(count(DISTINCT rv.campaign_id || rv.vehicle_id), 0) AS recall_completion_pct
    FROM (SELECT DISTINCT month_start FROM vehicle_months) mo
    JOIN recalls r ON r.launch_date + INTERVAL 8 WEEK <= last_day(mo.month_start)
    JOIN recall_vehicles rv ON rv.campaign_id = r.campaign_id
    JOIN vehicles v ON v.vehicle_id = rv.vehicle_id
    LEFT JOIN work_orders w ON w.campaign_id = rv.campaign_id AND w.vehicle_id = rv.vehicle_id
                           AND w.closed_at < last_day(mo.month_start) + INTERVAL 1 DAY
    GROUP BY ALL
)
SELECT f.region, f.month_start, f.active_vehicles, f.availability_pct, f.utilization_pct,
       round(s.turnaround_p50_h, 1)      AS turnaround_p50_h,
       round(s.first_time_fix_pct, 1)    AS first_time_fix_pct,
       c.cost_vs_budget_pct, c.fleet_cost_per_vehicle_month,
       round(r.recall_completion_pct, 1) AS recall_completion_pct
FROM fleet_monthly f
LEFT JOIN service s USING (region, month_start)
LEFT JOIN cost_monthly c USING (region, month_start)
LEFT JOIN recall r USING (region, month_start);

CREATE OR REPLACE VIEW exec_scorecard AS
WITH cur AS (SELECT * FROM region_month_kpis WHERE month_start = report_month()),
prior AS (
    SELECT region, avg(availability_pct) a, avg(turnaround_p50_h) t, avg(first_time_fix_pct) f
    FROM region_month_kpis
    WHERE month_start >= report_month() - INTERVAL 3 MONTH AND month_start < report_month()
    GROUP BY ALL
),
pm AS (
    SELECT region, round(100.0 * sum(vehicles - overdue) / sum(vehicles), 1) AS pm_compliance_pct
    FROM pm_compliance GROUP BY ALL
),
econ AS (
    SELECT region,
           round(sum(energy_cost) / nullif(sum(km), 0), 4)                                       AS energy_cost_per_km,
           round((sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0), 4) AS tco_per_km,
           round(1000 * sum(co2_kg) / nullif(sum(km), 0), 1)                                     AS co2_g_per_km
    FROM vehicle_month_economics GROUP BY ALL
)
SELECT c.region, c.month_start, c.active_vehicles,
       c.availability_pct,      rag('availability_pct', c.availability_pct)           AS availability_rag,
       round(c.availability_pct - p.a, 2)                                             AS availability_delta,
       c.utilization_pct,       rag('utilization_pct', c.utilization_pct)             AS utilization_rag,
       c.turnaround_p50_h,      rag('turnaround_p50_h', c.turnaround_p50_h)           AS turnaround_rag,
       round(c.turnaround_p50_h - p.t, 1)                                             AS turnaround_delta,
       c.first_time_fix_pct,    rag('first_time_fix_pct', c.first_time_fix_pct)       AS first_time_fix_rag,
       c.cost_vs_budget_pct,    rag('cost_vs_budget_pct', c.cost_vs_budget_pct)       AS cost_rag,
       m.pm_compliance_pct,     rag('pm_compliance_pct', m.pm_compliance_pct)         AS pm_rag,
       c.recall_completion_pct, rag('recall_completion_pct', c.recall_completion_pct) AS recall_rag,
       e.energy_cost_per_km, e.tco_per_km, e.co2_g_per_km
FROM cur c
LEFT JOIN prior p USING (region)
LEFT JOIN pm m USING (region)
LEFT JOIN econ e USING (region)
ORDER BY c.active_vehicles DESC;
