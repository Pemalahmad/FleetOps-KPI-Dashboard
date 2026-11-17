-- Fleet availability and utilization, by market and month.
--
-- availability_pct = 1 - (vehicle-hours lost in the workshop / vehicle-hours in service)
-- utilization_pct  = active hours / (days in service x 16 planned operating hours)
--
-- Downtime is attributed to the month the job was opened; jobs still open at the
-- snapshot count the hours elapsed so far. Recall visits count as downtime too.
CREATE OR REPLACE VIEW fleet_monthly AS
WITH usage AS (
    SELECT market_id, month_start,
           count(*)                     AS active_vehicles,
           sum(days_in_service)         AS vehicle_days,
           sum(active_hours)            AS active_hours,
           sum(km)                      AS km
    FROM vehicle_months
    GROUP BY ALL
),
downtime AS (
    SELECT market_id,
           date_trunc('month', opened_at)::DATE AS month_start,
           sum(CASE WHEN closed_at IS NOT NULL THEN turnaround_h
                    ELSE date_diff('minute', opened_at, snapshot_ts()) / 60.0 END) AS downtime_h,
           count(*)                                                                AS jobs_opened
    FROM service_jobs
    GROUP BY ALL
)
SELECT
    m.market, u.market_id, u.month_start,
    u.active_vehicles,
    u.vehicle_days,
    coalesce(d.jobs_opened, 0)                                              AS jobs_opened,
    round(coalesce(d.downtime_h, 0), 0)                                     AS downtime_h,
    round(100 * (1 - coalesce(d.downtime_h, 0) / (u.vehicle_days * 24.0)), 2) AS availability_pct,
    round(100 * u.active_hours / (u.vehicle_days * 16.0), 1)                AS utilization_pct,
    round(u.km / u.vehicle_days, 0)                                         AS km_per_vehicle_day
FROM usage u
JOIN markets m USING (market_id)
LEFT JOIN downtime d USING (market_id, month_start);
