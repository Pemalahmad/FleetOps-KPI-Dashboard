-- Preventive-maintenance compliance: is every vehicle inside its service interval?
-- Interval per powertrain from fleet.yml (km or months, whichever comes first), plus a tolerance.
-- km since last service = km driven since the last closed preventive job (pro-rated within its month).

CREATE OR REPLACE VIEW pm_status AS
WITH last_pm AS (
    SELECT vehicle_id, max(closed_at) AS last_pm_at
    FROM work_orders
    WHERE job_type = 'Preventive maintenance' AND closed_at IS NOT NULL
    GROUP BY ALL
),
base AS (
    SELECT v.vehicle_id, v.region, v.powertrain, v.home_site_id,
           coalesce(lp.last_pm_at, greatest(v.in_service_date, cfg_text('analysis_start')::DATE)::TIMESTAMP) AS since_ts,
           lp.last_pm_at IS NOT NULL AS has_pm,
           i.km AS interval_km, i.months AS interval_months
    FROM vehicles v
    LEFT JOIN last_pm lp USING (vehicle_id)
    JOIN cfg_pm_intervals i USING (powertrain)
    WHERE v.in_service_date < snapshot_ts()::DATE
      AND coalesce(v.out_of_service_date, DATE '9999-12-31') >= snapshot_ts()::DATE
),
km_since AS (
    SELECT b.vehicle_id,
           sum(CASE WHEN vm.month_start > date_trunc('month', b.since_ts) THEN vm.km
                    WHEN vm.month_start = date_trunc('month', b.since_ts)
                    THEN vm.km * (1 - (day(b.since_ts) - 1) / day(last_day(vm.month_start))::DOUBLE)
                    ELSE 0 END) AS km_since
    FROM base b JOIN vehicle_months vm USING (vehicle_id)
    GROUP BY ALL
)
SELECT b.vehicle_id, b.region, b.powertrain, s.site_name AS home_site,
       b.since_ts AS last_service_or_start, b.has_pm,
       round(coalesce(k.km_since, 0), 0)                       AS km_since_service,
       date_diff('month', b.since_ts, snapshot_ts())           AS months_since_service,
       b.interval_km, b.interval_months,
       CASE
           WHEN coalesce(k.km_since, 0) > b.interval_km * (1 + cfg_num('pm_tolerance_pct') / 100)
             OR date_diff('day', b.since_ts, snapshot_ts()) > b.interval_months * 30.4 * (1 + cfg_num('pm_tolerance_pct') / 100)
               THEN 'Overdue'
           WHEN coalesce(k.km_since, 0) > b.interval_km * 0.85
             OR date_diff('day', b.since_ts, snapshot_ts()) > b.interval_months * 30.4 * 0.85
               THEN 'Due soon'
           ELSE 'OK'
       END                                                     AS pm_state
FROM base b
LEFT JOIN km_since k USING (vehicle_id)
LEFT JOIN sites s ON s.site_id = b.home_site_id;

CREATE OR REPLACE VIEW pm_compliance AS
SELECT region, home_site, powertrain,
       count(*)                                         AS vehicles,
       count(*) FILTER (WHERE pm_state = 'Overdue')     AS overdue,
       count(*) FILTER (WHERE pm_state = 'Due soon')    AS due_soon,
       round(100.0 * count(*) FILTER (WHERE pm_state <> 'Overdue') / count(*), 1) AS pm_compliance_pct
FROM pm_status GROUP BY ALL;
