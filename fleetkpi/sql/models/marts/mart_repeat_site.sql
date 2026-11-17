-- description: Repeat visits and repeat repairs per site, KPI window
SELECT s.site_id, s.site_name, s.region,
       count(*)                                                                    AS visits,
       round(100.0 * avg(v.is_repeat_visit::INT), 1)                               AS repeat_visit_pct,
       count(*) FILTER (WHERE v.is_repeat_repair)                                  AS repeat_repairs,
       round(100.0 * count(*) FILTER (WHERE v.is_repeat_repair)
             / nullif(count(*) FILTER (WHERE v.job_type IN ('Repair', 'Warranty')), 0), 1) AS repeat_repair_pct
FROM int_visits v
JOIN stg_sites s USING (site_id)
WHERE v.key_in_ts::DATE > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
GROUP BY ALL
