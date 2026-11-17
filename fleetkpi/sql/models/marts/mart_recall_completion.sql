-- description: Recall completion by campaign and region
SELECT r.campaign_id, r.title, r.region,
       count(DISTINCT r.vehicle_id)                                         AS affected_vehicles,
       count(DISTINCT w.vehicle_id) FILTER (WHERE w.closed_at IS NOT NULL)  AS completed_vehicles,
       round(100.0 * count(DISTINCT w.vehicle_id) FILTER (WHERE w.closed_at IS NOT NULL)
             / count(DISTINCT r.vehicle_id), 1)                             AS completion_pct,
       round(median(date_diff('day', r.launch_date, w.closed_at::DATE)), 0) AS median_days_to_fix,
       date_diff('day', any_value(r.launch_date), snapshot_date())          AS days_since_launch
FROM stg_recall_vehicles r
LEFT JOIN stg_work_orders w ON w.campaign_id = r.campaign_id AND w.vehicle_id = r.vehicle_id
GROUP BY ALL
ORDER BY r.campaign_id, completion_pct
