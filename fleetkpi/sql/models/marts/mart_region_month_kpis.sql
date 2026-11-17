-- description: Every monthly KPI by region and month, the input to the scorecard and trends
WITH service AS (
    SELECT vehicle_region AS region, date_trunc('month', closed_at)::DATE AS month_start,
           100 * (1 - avg(repeat_visit::INT)) AS first_time_fix_pct
    FROM stg_work_orders WHERE job_type <> 'Recall' AND closed_at IS NOT NULL
    GROUP BY ALL
),
prod AS (
    SELECT region, month_start, 100.0 * sum(billed_hours) / nullif(sum(available_hours), 0) AS productivity_pct
    FROM int_site_month_productivity GROUP BY ALL
),
recall AS (
    -- completion across campaigns launched at least 8 weeks before month end
    SELECT r.region, mo.month_start,
           100.0 * count(DISTINCT w.campaign_id || w.vehicle_id)
                 / nullif(count(DISTINCT r.campaign_id || r.vehicle_id), 0) AS recall_completion_pct
    FROM (SELECT DISTINCT month_start FROM int_vehicle_months) mo
    JOIN stg_recall_vehicles r ON r.launch_date + INTERVAL 8 WEEK <= last_day(mo.month_start)
    LEFT JOIN stg_work_orders w ON w.campaign_id = r.campaign_id AND w.vehicle_id = r.vehicle_id
                               AND w.closed_at < last_day(mo.month_start) + INTERVAL 1 DAY
    GROUP BY ALL
)
SELECT f.region, f.month_start, f.active_vehicles, f.availability_pct, f.utilization_pct,
       k.key_to_key_p50_h, k.on_target_pct AS key_to_key_on_target_pct,
       round(s.first_time_fix_pct, 1)   AS first_time_fix_pct,
       round(p.productivity_pct, 1)     AS productivity_pct,
       cu.avg_rating, cu.csat_pct, cu.low_rating_pct, cu.responses,
       c.cost_vs_budget_pct, c.fleet_cost_per_vehicle_month,
       round(r.recall_completion_pct, 1) AS recall_completion_pct
FROM mart_fleet_monthly f
LEFT JOIN mart_key_to_key_monthly k USING (region, month_start)
LEFT JOIN service s USING (region, month_start)
LEFT JOIN prod p USING (region, month_start)
LEFT JOIN mart_customer_monthly cu USING (region, month_start)
LEFT JOIN mart_cost_monthly c USING (region, month_start)
LEFT JOIN recall r USING (region, month_start)
