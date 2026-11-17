-- Recall campaign completion: the evidence a regulator asks for.
CREATE OR REPLACE VIEW recall_completion AS
SELECT
    r.campaign_id, r.title, m.market,
    count(DISTINCT cv.vehicle_id)                                   AS affected_vehicles,
    count(DISTINCT j.vehicle_id) FILTER (WHERE j.closed_at IS NOT NULL) AS completed_vehicles,
    round(100.0 * count(DISTINCT j.vehicle_id) FILTER (WHERE j.closed_at IS NOT NULL)
          / count(DISTINCT cv.vehicle_id), 1)                       AS completion_pct,
    round(median(date_diff('day', r.launch_date, j.closed_at::DATE)), 0) AS median_days_to_fix,
    date_diff('day', r.launch_date, snapshot_ts()::DATE)            AS days_since_launch
FROM recall_campaigns r
JOIN recall_campaign_vehicles cv USING (campaign_id)
JOIN markets m ON m.market_id = cv.market_id
LEFT JOIN service_jobs j
       ON j.campaign_id = cv.campaign_id AND j.vehicle_id = cv.vehicle_id
GROUP BY ALL
ORDER BY r.campaign_id, completion_pct;

-- Cumulative completion curve by week since launch, per campaign and market.
CREATE OR REPLACE VIEW recall_curve AS
WITH weeks AS (
    SELECT r.campaign_id, r.launch_date,
           unnest(generate_series(0, date_diff('week', r.launch_date, snapshot_ts()::DATE))) AS week_no
    FROM recall_campaigns r
),
affected AS (
    SELECT campaign_id, market_id, count(*) AS n FROM recall_campaign_vehicles GROUP BY ALL
),
fixed AS (
    SELECT j.campaign_id, j.market_id,
           date_diff('week', r.launch_date, j.closed_at::DATE) AS week_fixed
    FROM service_jobs j JOIN recall_campaigns r USING (campaign_id)
    WHERE j.closed_at IS NOT NULL
)
SELECT
    w.campaign_id, m.market, w.week_no,
    round(100.0 * (SELECT count(*) FROM fixed f
                   WHERE f.campaign_id = w.campaign_id AND f.market_id = a.market_id
                     AND f.week_fixed <= w.week_no) / a.n, 1) AS cumulative_completion_pct
FROM weeks w
JOIN affected a USING (campaign_id)
JOIN markets m ON m.market_id = a.market_id;
