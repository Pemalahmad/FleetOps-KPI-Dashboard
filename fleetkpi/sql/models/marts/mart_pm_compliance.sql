-- description: Preventive-maintenance compliance by region, home site and powertrain
SELECT p.region, s.site_name AS home_site, p.powertrain,
       count(*)                                          AS vehicles,
       count(*) FILTER (WHERE p.pm_state = 'Overdue')    AS overdue,
       count(*) FILTER (WHERE p.pm_state = 'Due soon')   AS due_soon,
       round(100.0 * count(*) FILTER (WHERE p.pm_state <> 'Overdue') / count(*), 1) AS pm_compliance_pct
FROM int_pm_status p
LEFT JOIN stg_sites s ON s.site_id = p.home_site_id
GROUP BY ALL
