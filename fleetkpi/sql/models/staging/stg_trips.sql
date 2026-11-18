-- description: Trips or period summaries from telematics, with the vehicle's region and site and the driver (from the trip, else the vehicle's assigned driver)
SELECT t.trip_id, t.vehicle_id, coalesce(t.driver_id, a.driver_id) AS driver_id, v.region, v.home_site_id, v.powertrain,
       t.start_ts, t.end_ts, date_trunc('month', t.start_ts)::DATE AS month_start, greatest(coalesce(t.km, 0), 0) AS km,
       greatest(coalesce(t.driving_minutes, 0), 0) AS driving_minutes, greatest(coalesce(t.idle_minutes, 0), 0) AS idle_minutes,
       t.max_speed_kmh, t.speeding_events, t.harsh_events, t.geofence_exits
FROM trips t
JOIN stg_vehicles v USING (vehicle_id)
LEFT JOIN (SELECT vehicle_id, min(driver_id) AS driver_id FROM drivers WHERE vehicle_id IS NOT NULL GROUP BY 1) a USING (vehicle_id)
