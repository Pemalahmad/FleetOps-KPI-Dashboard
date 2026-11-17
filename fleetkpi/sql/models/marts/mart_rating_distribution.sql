-- description: Star-rating distribution by region, KPI window
SELECT region, rating, count(*) AS responses
FROM stg_feedback
WHERE region IS NOT NULL
  AND month_start > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
GROUP BY ALL
