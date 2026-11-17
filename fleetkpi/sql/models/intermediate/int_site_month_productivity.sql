-- description: Technician productivity per site-month = billed labour hours / available productive hours
WITH billed AS (
    SELECT site_id, date_trunc('month', closed_at)::DATE AS month_start,
           sum(labour_hours) AS billed_h, count(*) AS jobs_closed
    FROM stg_work_orders
    WHERE closed_at IS NOT NULL AND closed_at < snapshot_ts()
    GROUP BY ALL
),
cal AS (
    SELECT unnest(generate_series(cfg_text('analysis_start')::DATE, report_month(), INTERVAL 1 MONTH))::DATE AS month_start
)
SELECT s.site_id, s.site_name, s.region, c.month_start,
       coalesce(b.jobs_closed, 0)                                                       AS jobs_closed,
       round(coalesce(b.billed_h, 0), 1)                                                AS billed_hours,
       round(s.productive_hours_per_day
             * (date_diff('day', greatest(c.month_start, coalesce(s.open_date, c.month_start)), last_day(c.month_start)) + 1)
             * cfg_num('working_days_per_week') / 7.0, 1)                               AS available_hours
FROM stg_sites s
JOIN cal c ON coalesce(s.open_date, DATE '1900-01-01') <= last_day(c.month_start)
LEFT JOIN billed b ON b.site_id = s.site_id AND b.month_start = c.month_start
WHERE s.technicians > 0
