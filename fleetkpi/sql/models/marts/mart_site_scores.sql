-- description: Site Ops Score (0-1,000) for the current and previous 4-week periods; every component is an existing KPI
WITH b AS (SELECT max(wk) AS last_wk FROM int_site_weekly),
periods AS (
    SELECT w.*, CASE WHEN w.wk > b.last_wk - INTERVAL 4 WEEK THEN 'current'
                     WHEN w.wk > b.last_wk - INTERVAL 8 WEEK THEN 'previous' END AS period,
           CASE WHEN w.wk > b.last_wk - INTERVAL 4 WEEK THEN b.last_wk - INTERVAL 4 WEEK
                ELSE b.last_wk - INTERVAL 8 WEEK END AS period_start
    FROM int_site_weekly w, b
),
agg AS (
    SELECT site_id, site_name, region, period, any_value(period_start) AS period_start,
           sum(jobs_closed)              AS jobs,
           avg(p50_key_to_key_h)         AS k2k_h,
           avg(first_time_fix_pct)       AS ftf_pct,
           avg(productivity_pct)         AS productivity_pct
    FROM periods WHERE period IS NOT NULL
    GROUP BY ALL
),
csat AS (
    SELECT a.site_id, a.period, 100.0 * avg(f.is_satisfied::INT) AS csat_pct
    FROM agg a JOIN stg_feedback f
      ON f.site_id = a.site_id AND f.date >= a.period_start AND f.date < a.period_start + INTERVAL 28 DAY
    GROUP BY ALL
),
pm AS (
    SELECT home_site_id AS site_id, 100.0 * avg((pm_state <> 'Overdue')::INT) AS pm_pct
    FROM int_pm_status GROUP BY ALL
),
net AS (SELECT period, median(k2k_h) AS net_k2k FROM agg GROUP BY ALL),
w AS (SELECT component, weight FROM cfg_score_weights),
scaled AS (
    -- each component scaled 0..1 across a realistic range before weighting
    SELECT a.*, c.csat_pct, coalesce(p.pm_pct, 100) AS pm_pct,
           least(greatest((n.net_k2k / nullif(a.k2k_h, 0) - 0.6) / 0.6, 0), 1)  AS s_k2k,
           least(greatest((a.ftf_pct - 95) / 5.0, 0), 1)                       AS s_ftf,
           least(greatest((coalesce(c.csat_pct, 80) - 60) / 35.0, 0), 1)       AS s_csat,
           least(greatest((coalesce(a.productivity_pct, 70) - 50) / 40.0, 0), 1) AS s_prod,
           least(greatest((coalesce(p.pm_pct, 100) - 85) / 15.0, 0), 1)       AS s_pm
    FROM agg a
    JOIN net n USING (period)
    LEFT JOIN csat c USING (site_id, period)
    LEFT JOIN pm p USING (site_id)
)
SELECT site_id, site_name, region, period, jobs,
       round(k2k_h, 1) AS key_to_key_p50_h, round(ftf_pct, 1) AS first_time_fix_pct,
       round(csat_pct, 1) AS csat_pct, round(productivity_pct, 1) AS productivity_pct, round(pm_pct, 1) AS pm_compliance_pct,
       round(1000 * (
           coalesce((SELECT weight FROM w WHERE component = 'key_to_key'), 0)     * s_k2k +
           coalesce((SELECT weight FROM w WHERE component = 'first_time_fix'), 0) * s_ftf +
           coalesce((SELECT weight FROM w WHERE component = 'csat'), 0)           * s_csat +
           coalesce((SELECT weight FROM w WHERE component = 'productivity'), 0)   * s_prod +
           coalesce((SELECT weight FROM w WHERE component = 'pm_compliance'), 0)  * s_pm
       ) / nullif((SELECT sum(weight) FROM w), 0), 0) AS ops_score
FROM scaled
