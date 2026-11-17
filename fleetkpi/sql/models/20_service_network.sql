-- Service network: weekly turnaround, throughput and quality per site, with an explicit
-- INTERVENE flag a manager can act on this week. Complete weeks only; recall visits excluded
-- because they are scheduled, not demand-driven.

CREATE OR REPLACE VIEW center_weekly AS
WITH jobs AS (
    SELECT site_id,
           date_trunc('week', closed_at)::DATE                 AS wk,
           count(*)                                            AS jobs_closed,
           median(turnaround_h)                                AS p50_turnaround_h,
           quantile_cont(turnaround_h, 0.9)                    AS p90_turnaround_h,
           avg((coalesce(parts_wait_hours, 0) > 0)::INT)       AS parts_wait_share,
           1 - avg(repeat_visit::INT)                          AS first_time_fix,
           avg((turnaround_h <= 24)::INT)                      AS same_day_share,
           sum(labour_hours)                                   AS labour_h
    FROM wo
    WHERE job_type <> 'Recall' AND closed_at < date_trunc('week', snapshot_ts())
      -- 14-day warm-up: early weeks only contain jobs that happened to close fast
      AND closed_at >= cfg_text('analysis_start')::DATE + INTERVAL 14 DAY
    GROUP BY ALL
),
scored AS (
    SELECT j.*, s.site_name, s.region, s.technicians,
           median(j.p50_turnaround_h) FILTER (WHERE j.jobs_closed >= cfg_num('min_weekly_jobs'))
               OVER (PARTITION BY j.wk)                        AS network_p50_h,
           avg(j.p50_turnaround_h) OVER (PARTITION BY j.site_id ORDER BY j.wk
               ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING)       AS trailing_4wk_p50_h
    FROM jobs j JOIN sites s USING (site_id)
)
SELECT site_id, site_name, region, wk, jobs_closed,
       round(jobs_closed::DOUBLE / nullif(technicians, 0), 2)  AS jobs_per_tech,
       round(100 * labour_h / nullif(technicians * 40.0, 0), 1) AS tech_utilization_pct,
       round(p50_turnaround_h, 1)                              AS p50_turnaround_h,
       round(p90_turnaround_h, 1)                              AS p90_turnaround_h,
       round(100 * parts_wait_share, 1)                        AS parts_wait_pct,
       round(100 * first_time_fix, 1)                          AS first_time_fix_pct,
       round(100 * same_day_share, 1)                          AS same_day_release_pct,
       round(network_p50_h, 1)                                 AS network_p50_h,
       round(100.0 * (p50_turnaround_h / network_p50_h - 1), 1) AS pct_vs_network,
       CASE
           WHEN jobs_closed < cfg_num('min_weekly_jobs') THEN 'LOW VOLUME'
           WHEN p50_turnaround_h > cfg_num('intervene_ratio') * network_p50_h
             OR p50_turnaround_h > cfg_num('intervene_ratio') * trailing_4wk_p50_h THEN 'INTERVENE'
           WHEN p50_turnaround_h > cfg_num('watch_ratio') * network_p50_h THEN 'WATCH'
           ELSE 'OK'
       END                                                     AS status
FROM scored;

-- Latest 4 complete weeks vs the 13 before: is each site getting better or worse?
CREATE OR REPLACE VIEW center_scorecard AS
WITH b AS (SELECT max(wk) AS last_wk FROM center_weekly),
tagged AS (
    SELECT w.*, CASE WHEN w.wk > b.last_wk - INTERVAL 4 WEEK  THEN 'recent'
                     WHEN w.wk > b.last_wk - INTERVAL 17 WEEK THEN 'prior' END AS period
    FROM center_weekly w, b
)
SELECT site_id, site_name, region,
       sum(jobs_closed) FILTER (WHERE period = 'recent')                         AS jobs_4wk,
       round(avg(p50_turnaround_h) FILTER (WHERE period = 'recent'), 1)          AS p50_turnaround_4wk_h,
       round(avg(p50_turnaround_h) FILTER (WHERE period = 'prior'), 1)           AS p50_turnaround_prior_h,
       round(100.0 * (avg(p50_turnaround_h) FILTER (WHERE period = 'recent')
                    / avg(p50_turnaround_h) FILTER (WHERE period = 'prior') - 1), 1) AS turnaround_change_pct,
       round(avg(first_time_fix_pct) FILTER (WHERE period = 'recent'), 1)        AS first_time_fix_4wk_pct,
       round(avg(parts_wait_pct) FILTER (WHERE period = 'recent'), 1)            AS parts_wait_4wk_pct,
       count(*) FILTER (WHERE period = 'recent' AND status = 'INTERVENE')        AS intervene_weeks_4wk,
       count(*) FILTER (WHERE period = 'prior'  AND status = 'INTERVENE')        AS intervene_weeks_prior
FROM tagged WHERE period IS NOT NULL
GROUP BY ALL
ORDER BY p50_turnaround_4wk_h DESC;

-- Open work at the snapshot, aged. Anything over 72h is customer-facing.
CREATE OR REPLACE VIEW backlog AS
SELECT s.site_name, s.region, w.job_type,
       count(*)                                                                    AS open_jobs,
       count(*) FILTER (WHERE date_diff('hour', w.opened_at, snapshot_ts()) > 72)  AS older_than_72h,
       max(date_diff('hour', w.opened_at, snapshot_ts()))                          AS oldest_h
FROM wo w JOIN sites s USING (site_id)
WHERE w.closed_at IS NULL
GROUP BY ALL
ORDER BY older_than_72h DESC, open_jobs DESC;
