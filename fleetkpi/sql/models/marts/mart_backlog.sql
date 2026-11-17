-- description: Open work at the snapshot per site: aging buckets and days of backlog (open jobs / average daily completions, last 28 days)
WITH open_jobs AS (
    SELECT site_id, date_diff('hour', key_in_ts, snapshot_ts()) / 24.0 AS age_days
    FROM stg_work_orders WHERE is_open
),
pace AS (
    SELECT site_id, count(*) / 28.0 AS daily_closures
    FROM stg_work_orders
    WHERE closed_at >= snapshot_ts() - INTERVAL 28 DAY AND closed_at < snapshot_ts()
    GROUP BY ALL
)
SELECT s.site_id, s.site_name, s.region,
       count(o.site_id)                                         AS open_jobs,
       count(*) FILTER (WHERE o.age_days < 1)                   AS age_lt_1d,
       count(*) FILTER (WHERE o.age_days >= 1 AND o.age_days < 3) AS age_1_3d,
       count(*) FILTER (WHERE o.age_days >= 3 AND o.age_days < 7) AS age_3_7d,
       count(*) FILTER (WHERE o.age_days >= 7)                  AS age_7d_plus,
       round(coalesce(max(o.age_days), 0), 1)                   AS oldest_days,
       round(coalesce(any_value(p.daily_closures), 0), 1)       AS daily_closures,
       round(count(o.site_id) / nullif(any_value(p.daily_closures), 0), 2) AS backlog_days
FROM stg_sites s
LEFT JOIN open_jobs o USING (site_id)
LEFT JOIN pace p USING (site_id)
GROUP BY ALL
