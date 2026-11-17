-- description: Network-wide monthly series for every headline KPI (sparklines and trend charts)
WITH f AS (
    SELECT month_start, sum(active_vehicles) AS active_vehicles,
           100 * (1 - sum(downtime_h) / (sum(vehicle_days) * 24.0)) AS availability_pct,
           sum(utilization_pct * vehicle_days) / sum(vehicle_days)  AS utilization_pct
    FROM mart_fleet_monthly GROUP BY ALL
),
k AS (
    SELECT date_trunc('month', key_out_ts)::DATE AS month_start, median(key_to_key_h) AS key_to_key_p50_h,
           100 * (1 - avg(repeat_visit::INT)) AS first_time_fix_pct
    FROM stg_work_orders WHERE job_type <> 'Recall' AND key_out_ts < snapshot_ts() GROUP BY ALL
),
c AS (
    SELECT month_start, avg(rating) AS avg_rating, 100.0 * avg(is_satisfied::INT) AS csat_pct,
           100.0 * avg(is_low::INT) AS low_rating_pct, count(*) AS responses
    FROM stg_feedback GROUP BY ALL
),
p AS (SELECT month_start, 100.0 * sum(billed_hours) / nullif(sum(available_hours), 0) AS productivity_pct
      FROM int_site_month_productivity GROUP BY ALL),
v AS (SELECT month_start, sum(book_value) AS book_value, sum(depreciation) AS depreciation
      FROM mart_asset_value_monthly GROUP BY ALL),
m AS (SELECT month_start, 100.0 * (sum(fleet_cost) / nullif(sum(budget), 0) - 1) AS cost_vs_budget_pct
      FROM mart_cost_monthly GROUP BY ALL)
SELECT f.month_start, f.active_vehicles,
       round(f.availability_pct, 2) AS availability_pct, round(f.utilization_pct, 1) AS utilization_pct,
       round(k.key_to_key_p50_h, 1) AS key_to_key_p50_h, round(k.first_time_fix_pct, 1) AS first_time_fix_pct,
       round(c.avg_rating, 2) AS avg_rating, round(c.csat_pct, 1) AS csat_pct,
       round(c.low_rating_pct, 1) AS low_rating_pct, c.responses,
       round(p.productivity_pct, 1) AS productivity_pct,
       round(v.book_value, 0) AS book_value, round(v.depreciation, 0) AS depreciation,
       round(m.cost_vs_budget_pct, 1) AS cost_vs_budget_pct
FROM f
LEFT JOIN k USING (month_start)
LEFT JOIN c USING (month_start)
LEFT JOIN p USING (month_start)
LEFT JOIN v USING (month_start)
LEFT JOIN m USING (month_start)
ORDER BY f.month_start
