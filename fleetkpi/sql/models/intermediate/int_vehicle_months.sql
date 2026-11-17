-- description: One row per vehicle per month in service, with distance, hours and month-end book value
-- materialized: table
WITH months AS (
    SELECT unnest(generate_series(cfg_text('analysis_start')::DATE, report_month(), INTERVAL 1 MONTH))::DATE AS month_start
),
active AS (
    SELECT v.vehicle_id, v.region, v.powertrain, v.fuel_type, v.home_site_id, v.purchase_cost, v.in_service_date,
           m.month_start,
           greatest(m.month_start, v.in_service_date) AS d_from,
           least(last_day(m.month_start), coalesce(v.out_of_service_date, DATE '9999-12-31'), snapshot_date() - 1) AS d_to
    FROM stg_vehicles v
    JOIN months m
      ON v.in_service_date <= last_day(m.month_start)
     AND coalesce(v.out_of_service_date, DATE '9999-12-31') >= m.month_start
),
u AS (
    SELECT vehicle_id, month_start, sum(km) AS km,
           sum(operating_hours) AS operating_hours, count(operating_hours) AS n_hours
    FROM stg_usage GROUP BY ALL
)
SELECT
    a.vehicle_id, a.region, a.powertrain, a.fuel_type, a.home_site_id, a.purchase_cost, a.in_service_date, a.month_start,
    date_diff('day', a.d_from, a.d_to) + 1                                        AS days_in_service,
    coalesce(u.km, 0)                                                             AS km,
    CASE WHEN u.n_hours > 0 THEN u.operating_hours END                            AS operating_hours,
    book_value(a.purchase_cost, date_diff('month', a.in_service_date, a.month_start))      AS book_value_start,
    book_value(a.purchase_cost, date_diff('day', a.in_service_date, a.d_to) / 30.4375)     AS book_value_end
FROM active a
LEFT JOIN u USING (vehicle_id, month_start)
WHERE a.d_to >= a.d_from
