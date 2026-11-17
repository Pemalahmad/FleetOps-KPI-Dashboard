-- description: Key-to-key time (key in to key back) by region and month, recalls excluded
SELECT vehicle_region AS region, date_trunc('month', key_out_ts)::DATE AS month_start,
       count(*)                                                                   AS jobs,
       round(median(key_to_key_h), 1)                                             AS key_to_key_p50_h,
       round(quantile_cont(key_to_key_h, 0.9), 1)                                 AS key_to_key_p90_h,
       round(100.0 * avg((key_to_key_h <= cfg_num('key_to_key_target_h'))::INT), 1) AS on_target_pct
FROM stg_work_orders
WHERE job_type <> 'Recall' AND key_out_ts IS NOT NULL AND key_out_ts < snapshot_ts()
GROUP BY ALL
