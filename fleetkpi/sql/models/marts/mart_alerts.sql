-- description: The alert rules engine: telematics trips and driver licences checked against the limits in fleet.yml (alerts:); one row per vehicle or driver over a limit in the alert window
WITH w AS (
    SELECT * FROM stg_trips WHERE start_ts >= snapshot_ts() - to_days(CAST(cfg_num('alert_window_days') AS INTEGER))
),
v AS (
    SELECT vehicle_id, any_value(region) AS region, sum(km) AS km, sum(speeding_events) AS sp, sum(harsh_events) AS ha,
           sum(idle_minutes) AS idle, sum(driving_minutes) AS drive, sum(geofence_exits) AS geo
    FROM w GROUP BY 1
),
driven AS (SELECT DISTINCT driver_id FROM w WHERE driver_id IS NOT NULL)
SELECT 'speeding' AS rule, 'Speeding' AS rule_label, 'vehicle' AS subject_type, vehicle_id AS subject_id, vehicle_id, region,
       round(100.0 * sp / km, 2) AS value, cfg_num('alert_speeding_per_100km') AS threshold, 'events per 100 km' AS unit, 'warning' AS severity
FROM v WHERE km > 0 AND 100.0 * sp / km > cfg_num('alert_speeding_per_100km')
UNION ALL
SELECT 'harsh', 'Harsh driving', 'vehicle', vehicle_id, vehicle_id, region,
       round(100.0 * ha / km, 2), cfg_num('alert_harsh_per_100km'), 'events per 100 km', 'warning'
FROM v WHERE km > 0 AND 100.0 * ha / km > cfg_num('alert_harsh_per_100km')
UNION ALL
SELECT 'idle', 'Long idling', 'vehicle', vehicle_id, vehicle_id, region,
       round(100.0 * idle / (idle + drive), 1), cfg_num('alert_idle_pct'), '% of engine-on time', 'info'
FROM v WHERE idle + drive > 0 AND 100.0 * idle / (idle + drive) > cfg_num('alert_idle_pct')
UNION ALL
SELECT 'geofence', 'Left the permitted zone', 'vehicle', vehicle_id, vehicle_id, region,
       geo, cfg_num('alert_geofence_exits'), 'exits', 'critical'
FROM v WHERE geo >= cfg_num('alert_geofence_exits')
UNION ALL
SELECT 'licence_expired', 'Driving on an expired licence', 'driver', d.driver_id, d.vehicle_id, d.region,
       d.licence_days_left, 0, 'days left', 'critical'
FROM stg_drivers d JOIN driven USING (driver_id) WHERE d.licence_status = 'Expired'
UNION ALL
SELECT 'licence_expiring', 'Licence expiring soon', 'driver', d.driver_id, d.vehicle_id, d.region,
       d.licence_days_left, cfg_num('expiring_window_days'), 'days left', 'info'
FROM stg_drivers d WHERE d.is_active AND d.licence_status = 'Expiring'
