-- Executive scorecard: one row per market for the latest month, every KPI with
-- its RAG status and its change vs the prior 3-month average.
CREATE OR REPLACE VIEW market_month_kpis AS
WITH service AS (
    SELECT c.market_id,
           date_trunc('month', j.closed_at)::DATE AS month_start,
           median(j.turnaround_h)                 AS turnaround_p50_h,
           100 * (1 - avg(j.repeat_visit::INT))   AS first_time_fix_pct
    FROM service_jobs j JOIN service_centers c USING (center_id)
    WHERE j.job_type <> 'Recall' AND j.closed_at IS NOT NULL
    GROUP BY ALL
),
recall AS (
    -- Completion across all campaigns launched at least 8 weeks before month end.
    SELECT cv.market_id, mo.month_start,
           100.0 * count(DISTINCT j.campaign_id || j.vehicle_id)
                 / NULLIF(count(DISTINCT cv.campaign_id || cv.vehicle_id), 0) AS recall_completion_pct
    FROM (SELECT DISTINCT month_start FROM vehicle_months) mo
    JOIN recall_campaigns r ON r.launch_date + INTERVAL 8 WEEK <= last_day(mo.month_start)
    JOIN recall_campaign_vehicles cv ON cv.campaign_id = r.campaign_id
    LEFT JOIN service_jobs j ON j.campaign_id = cv.campaign_id AND j.vehicle_id = cv.vehicle_id
                            AND j.closed_at <= last_day(mo.month_start) + INTERVAL 1 DAY
    GROUP BY ALL
)
SELECT
    f.market, f.market_id, f.month_start, f.active_vehicles,
    f.availability_pct, f.utilization_pct,
    round(s.turnaround_p50_h, 1)        AS turnaround_p50_h,
    round(s.first_time_fix_pct, 1)      AS first_time_fix_pct,
    c.cost_vs_budget_pct,
    c.fleet_cost_per_vehicle_month_usd,
    round(r.recall_completion_pct, 1)   AS recall_completion_pct
FROM fleet_monthly f
LEFT JOIN service s USING (market_id, month_start)
LEFT JOIN cost_monthly c USING (market_id, month_start)
LEFT JOIN recall r USING (market_id, month_start);

CREATE OR REPLACE VIEW exec_scorecard AS
WITH latest AS (SELECT max(month_start) AS m FROM market_month_kpis),
cur AS (SELECT k.* FROM market_month_kpis k, latest WHERE k.month_start = latest.m),
prior AS (
    SELECT k.market_id,
           avg(availability_pct)   AS availability_prior,
           avg(utilization_pct)    AS utilization_prior,
           avg(turnaround_p50_h)   AS turnaround_prior,
           avg(first_time_fix_pct) AS ftf_prior,
           avg(cost_vs_budget_pct) AS cost_prior
    FROM market_month_kpis k, latest
    WHERE k.month_start >= latest.m - INTERVAL 3 MONTH AND k.month_start < latest.m
    GROUP BY ALL
)
SELECT
    c.market, c.month_start, c.active_vehicles,
    c.availability_pct,      rag('availability_pct', c.availability_pct)           AS availability_rag,
    round(c.availability_pct - p.availability_prior, 2)                            AS availability_delta,
    c.utilization_pct,       rag('utilization_pct', c.utilization_pct)             AS utilization_rag,
    round(c.utilization_pct - p.utilization_prior, 1)                              AS utilization_delta,
    c.turnaround_p50_h,      rag('turnaround_p50_h', c.turnaround_p50_h)           AS turnaround_rag,
    round(c.turnaround_p50_h - p.turnaround_prior, 1)                              AS turnaround_delta,
    c.first_time_fix_pct,    rag('first_time_fix_pct', c.first_time_fix_pct)       AS first_time_fix_rag,
    round(c.first_time_fix_pct - p.ftf_prior, 1)                                   AS first_time_fix_delta,
    c.cost_vs_budget_pct,    rag('cost_vs_budget_pct', c.cost_vs_budget_pct)       AS cost_rag,
    c.fleet_cost_per_vehicle_month_usd,
    c.recall_completion_pct, rag('recall_completion_pct', c.recall_completion_pct) AS recall_rag
FROM cur c
LEFT JOIN prior p USING (market_id)
ORDER BY c.active_vehicles DESC;
