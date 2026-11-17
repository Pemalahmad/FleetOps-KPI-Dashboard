-- description: Common repair and issue categories by powertrain, KPI window: volume, share, cost, key-to-key and repeat rate
WITH j AS (
    SELECT w.*, coalesce(v.is_repeat_repair, FALSE) AS is_repeat_repair
    FROM stg_work_orders w
    LEFT JOIN int_visits v USING (work_order_id)
    WHERE w.job_type NOT IN ('Recall', 'Preventive maintenance')
      AND w.key_in_ts::DATE > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
      AND w.key_in_ts < snapshot_ts()
),
agg AS (
    SELECT issue_category, powertrain,
           count(*)                                        AS jobs,
           round(avg(total_cost), 0)                       AS avg_cost,
           round(median(key_to_key_h), 1)                  AS key_to_key_p50_h,
           round(100.0 * avg(is_repeat_repair::INT), 1)    AS repeat_repair_pct
    FROM j
    GROUP BY issue_category, powertrain
)
SELECT issue_category, powertrain, jobs,
       round(100.0 * jobs / sum(jobs) OVER (PARTITION BY powertrain), 1) AS share_of_powertrain_pct,
       avg_cost, key_to_key_p50_h, repeat_repair_pct
FROM agg
ORDER BY jobs DESC
