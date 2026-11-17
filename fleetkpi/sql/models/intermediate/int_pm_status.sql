-- description: Preventive-maintenance state per active vehicle (km or months since last service vs powertrain interval)
WITH last_pm AS (
    SELECT vehicle_id, max(closed_at) AS last_pm_at
    FROM stg_work_orders
    WHERE job_type = 'Preventive maintenance' AND closed_at IS NOT NULL
    GROUP BY ALL
),
base AS (
    SELECT v.vehicle_id, v.region, v.powertrain, v.home_site_id,
           coalesce(lp.last_pm_at, greatest(v.in_service_date, cfg_text('analysis_start')::DATE)::TIMESTAMP) AS since_ts,
           lp.last_pm_at IS NOT NULL AS has_pm,
           i.km AS interval_km, i.months AS interval_months
    FROM stg_vehicles v
    LEFT JOIN last_pm lp USING (vehicle_id)
    JOIN cfg_pm_intervals i USING (powertrain)
    WHERE v.is_active
),
km_since AS (
    SELECT b.vehicle_id,
           sum(CASE WHEN vm.month_start > date_trunc('month', b.since_ts) THEN vm.km
                    WHEN vm.month_start = date_trunc('month', b.since_ts)
                    THEN vm.km * (1 - (day(b.since_ts) - 1) / day(last_day(vm.month_start))::DOUBLE)
                    ELSE 0 END) AS km_since
    FROM base b JOIN int_vehicle_months vm USING (vehicle_id)
    GROUP BY ALL
)
SELECT b.vehicle_id, b.region, b.powertrain, b.home_site_id,
       b.since_ts AS last_service_or_start, b.has_pm,
       round(coalesce(k.km_since, 0), 0)                      AS km_since_service,
       date_diff('month', b.since_ts, snapshot_ts())          AS months_since_service,
       b.interval_km, b.interval_months,
       CASE
           WHEN coalesce(k.km_since, 0) > b.interval_km * (1 + cfg_num('pm_tolerance_pct') / 100)
             OR date_diff('day', b.since_ts, snapshot_ts()) > b.interval_months * 30.4 * (1 + cfg_num('pm_tolerance_pct') / 100)
               THEN 'Overdue'
           WHEN coalesce(k.km_since, 0) > b.interval_km * 0.85
             OR date_diff('day', b.since_ts, snapshot_ts()) > b.interval_months * 30.4 * 0.85
               THEN 'Due soon'
           ELSE 'OK'
       END                                                    AS pm_state
FROM base b
LEFT JOIN km_since k USING (vehicle_id)
