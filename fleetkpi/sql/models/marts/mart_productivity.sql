-- description: Technician productivity per site and month (billed / available hours)
SELECT site_id, site_name, region, month_start, jobs_closed, billed_hours, available_hours,
       round(100.0 * billed_hours / nullif(available_hours, 0), 1) AS productivity_pct
FROM int_site_month_productivity
