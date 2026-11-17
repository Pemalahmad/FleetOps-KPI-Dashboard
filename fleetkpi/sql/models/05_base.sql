-- Base layer: work orders with turnaround, and one row per vehicle per month in service.

CREATE OR REPLACE VIEW wo AS
SELECT w.*,
       date_diff('minute', w.opened_at, w.closed_at) / 60.0 AS turnaround_h,
       v.powertrain, v.region AS vehicle_region
FROM work_orders w
JOIN vehicles v USING (vehicle_id);

CREATE OR REPLACE TABLE vehicle_months AS
WITH months AS (
    SELECT unnest(generate_series(cfg_text('analysis_start')::DATE, report_month(), INTERVAL 1 MONTH))::DATE AS month_start
),
active AS (
    SELECT v.vehicle_id, v.region, v.powertrain, v.fuel_type, v.home_site_id, v.purchase_cost,
           m.month_start,
           greatest(m.month_start, v.in_service_date) AS d_from,
           least(last_day(m.month_start),
                 coalesce(v.out_of_service_date, DATE '9999-12-31'),
                 (snapshot_ts() - INTERVAL 1 DAY)::DATE) AS d_to
    FROM vehicles v
    JOIN months m
      ON v.in_service_date <= last_day(m.month_start)
     AND coalesce(v.out_of_service_date, DATE '9999-12-31') >= m.month_start
),
u AS (
    SELECT vehicle_id, date_trunc('month', date)::DATE AS month_start,
           sum(km) AS km, sum(operating_hours) AS operating_hours, count(operating_hours) AS n_hours
    FROM usage GROUP BY ALL
)
SELECT a.vehicle_id, a.region, a.powertrain, a.fuel_type, a.home_site_id, a.purchase_cost, a.month_start,
       date_diff('day', a.d_from, a.d_to) + 1                 AS days_in_service,
       coalesce(u.km, 0)                                      AS km,
       CASE WHEN u.n_hours > 0 THEN u.operating_hours END     AS operating_hours
FROM active a
LEFT JOIN u USING (vehicle_id, month_start)
WHERE a.d_to >= a.d_from;
