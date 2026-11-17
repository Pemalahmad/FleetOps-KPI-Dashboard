-- description: Cumulative recall completion by week since launch, per campaign and region
WITH weeks AS (
    SELECT campaign_id, launch_date,
           unnest(generate_series(0, date_diff('week', launch_date, snapshot_date()))) AS week_no
    FROM recalls
),
affected AS (SELECT campaign_id, region, count(*) AS n FROM stg_recall_vehicles GROUP BY ALL),
fixed AS (
    SELECT r.campaign_id, r.region, date_diff('week', r.launch_date, w.closed_at::DATE) AS week_fixed
    FROM stg_recall_vehicles r
    JOIN stg_work_orders w ON w.campaign_id = r.campaign_id AND w.vehicle_id = r.vehicle_id
    WHERE w.closed_at IS NOT NULL
)
SELECT w.campaign_id, a.region, w.week_no,
       round(100.0 * (SELECT count(*) FROM fixed f
                      WHERE f.campaign_id = w.campaign_id AND f.region = a.region AND f.week_fixed <= w.week_no)
             / a.n, 1) AS cumulative_completion_pct
FROM weeks w JOIN affected a USING (campaign_id)
