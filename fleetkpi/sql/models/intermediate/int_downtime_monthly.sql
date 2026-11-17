-- description: Off-road hours per vehicle-month (key in -> back in operations; open jobs count elapsed hours to the snapshot)
SELECT vehicle_id, date_trunc('month', key_in_ts)::DATE AS month_start,
       sum(coalesce(off_road_h, date_diff('minute', key_in_ts, snapshot_ts()) / 60.0)) AS downtime_h,
       count(*) AS jobs_opened
FROM stg_work_orders
GROUP BY ALL
