-- description: Driving behaviour per driver over the alert window: distance, idle share, speeding and harsh events per 100 km, a 0-100 safety score with a band, and licence status
WITH t AS (
    SELECT driver_id, sum(km) AS km, count(*) AS trips, sum(driving_minutes) AS drive_min, sum(idle_minutes) AS idle_min,
           sum(speeding_events) AS speeding, sum(harsh_events) AS harsh, sum(geofence_exits) AS geofence, max(max_speed_kmh) AS top_speed
    FROM stg_trips
    WHERE driver_id IS NOT NULL AND start_ts >= snapshot_ts() - to_days(CAST(cfg_num('alert_window_days') AS INTEGER))
    GROUP BY 1
),
r AS (
    SELECT d.*, coalesce(t.km, 0) AS km, coalesce(t.trips, 0) AS trips, t.top_speed,
           100.0 * t.idle_min / nullif(t.idle_min + t.drive_min, 0) AS idle_pct,
           100.0 * t.speeding / nullif(t.km, 0) AS speeding_per_100km,
           100.0 * t.harsh / nullif(t.km, 0) AS harsh_per_100km,
           coalesce(t.geofence, 0) AS geofence_exits
    FROM stg_drivers d LEFT JOIN t USING (driver_id)
)
SELECT driver_id, driver_name, region, home_site_id, vehicle_id, licence_class, licence_expiry, licence_status, licence_days_left,
       is_active, km, trips, top_speed,
       round(idle_pct, 1) AS idle_pct, round(speeding_per_100km, 2) AS speeding_per_100km,
       round(harsh_per_100km, 2) AS harsh_per_100km, geofence_exits,
       CASE WHEN km > 0 THEN round(greatest(0, 100
            - 15 * least(3, coalesce(speeding_per_100km, 0) / cfg_num('alert_speeding_per_100km'))
            - 10 * least(3, coalesce(harsh_per_100km, 0) / cfg_num('alert_harsh_per_100km'))
            - least(15, greatest(0, coalesce(idle_pct, 0) - cfg_num('alert_idle_pct')))
            - 10 * least(2, geofence_exits)), 0) END AS safety_score
FROM r
