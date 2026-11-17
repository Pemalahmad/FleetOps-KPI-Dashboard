-- description: Customer satisfaction and 1-2 star ratings per site, KPI window
SELECT s.site_id, s.site_name, s.region,
       count(f.rating)                               AS responses,
       round(avg(f.rating), 2)                       AS avg_rating,
       round(100.0 * avg(f.is_satisfied::INT), 1)    AS csat_pct,
       count(*) FILTER (WHERE f.is_low)              AS low_ratings,
       round(100.0 * avg(f.is_low::INT), 1)          AS low_rating_pct
FROM stg_sites s
JOIN stg_feedback f USING (site_id)
WHERE f.month_start > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
GROUP BY ALL
