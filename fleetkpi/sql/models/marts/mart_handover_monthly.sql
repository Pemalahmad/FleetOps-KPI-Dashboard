-- description: The three clocks and the handover by region and month: workshop, time to pick up, back to operations, total off-road
SELECT vehicle_region AS region, date_trunc('month', key_out_ts)::DATE AS month_start,
       count(*)                                       AS jobs,
       round(median(workshop_h), 1)                   AS workshop_p50_h,
       round(median(time_to_pickup_h), 1)             AS time_to_pickup_p50_h,
       round(median(back_to_ops_h), 1)                AS back_to_ops_p50_h,
       round(median(key_to_key_h), 1)                 AS key_to_key_p50_h,
       round(median(off_road_h), 1)                   AS off_road_p50_h,
       round(avg(workshop_h), 1)                      AS workshop_avg_h,
       round(avg(time_to_pickup_h), 1)                AS time_to_pickup_avg_h,
       round(avg(back_to_ops_h), 1)                   AS back_to_ops_avg_h
FROM stg_work_orders
WHERE job_type <> 'Recall' AND back_in_service_ts IS NOT NULL AND back_in_service_ts < snapshot_ts()
GROUP BY ALL
