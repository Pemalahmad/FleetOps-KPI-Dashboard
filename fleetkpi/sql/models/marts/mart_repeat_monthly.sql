-- description: Repeat visits (back within the repeat window for any reason) and repeat repairs (same issue fixed again) by region and month
SELECT vehicle_region AS region, date_trunc('month', key_in_ts)::DATE AS month_start,
       count(*)                                                                    AS visits,
       count(*) FILTER (WHERE is_repeat_visit)                                     AS repeat_visits,
       round(100.0 * avg(is_repeat_visit::INT), 1)                                 AS repeat_visit_pct,
       count(*) FILTER (WHERE job_type IN ('Repair', 'Warranty'))                  AS repairs,
       count(*) FILTER (WHERE is_repeat_repair)                                    AS repeat_repairs,
       round(100.0 * count(*) FILTER (WHERE is_repeat_repair)
             / nullif(count(*) FILTER (WHERE job_type IN ('Repair', 'Warranty')), 0), 1) AS repeat_repair_pct
FROM int_visits
WHERE key_in_ts < snapshot_ts()
GROUP BY ALL
