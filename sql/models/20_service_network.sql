-- Service network: weekly turnaround, throughput and quality per center,
-- with an explicit INTERVENE flag a manager can act on this week.
--
-- Same pattern as the sample on the author's GitHub profile: baseline, drift,
-- and a threshold. Complete weeks only; recall visits are excluded because
-- they are scheduled, not demand-driven.
CREATE OR REPLACE VIEW center_weekly AS
WITH jobs AS (
    SELECT
        center_id,
        date_trunc('week', closed_at)::DATE                 AS wk,
        count(*)                                            AS jobs_closed,
        median(turnaround_h)                                AS p50_turnaround_h,
        quantile_cont(turnaround_h, 0.9)                    AS p90_turnaround_h,
        avg((parts_wait_h > 0)::INT)                        AS parts_wait_share,
        1 - avg(repeat_visit::INT)                          AS first_time_fix,
        sum(labour_h)                                       AS labour_h
    FROM service_jobs
    WHERE job_type <> 'Recall'
      AND closed_at <  date_trunc('week', snapshot_ts())    -- complete weeks only
    GROUP BY ALL
),
scored AS (
    SELECT
        j.*, c.center, c.market_id, c.technicians,
        j.jobs_closed::DOUBLE / NULLIF(c.technicians, 0)    AS jobs_per_tech,
        j.labour_h / NULLIF(c.technicians * 40.0, 0)        AS tech_utilization,
        median(j.p50_turnaround_h) OVER (PARTITION BY j.wk) AS network_p50_h,
        avg(j.p50_turnaround_h) OVER (PARTITION BY j.center_id ORDER BY j.wk
            ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING)       AS trailing_4wk_p50_h
    FROM jobs j
    JOIN service_centers c USING (center_id)
)
SELECT
    s.center_id, s.center, m.market, s.wk,
    s.jobs_closed,
    round(s.jobs_per_tech, 2)                               AS jobs_per_tech,
    round(100 * s.tech_utilization, 1)                      AS tech_utilization_pct,
    round(s.p50_turnaround_h, 1)                            AS p50_turnaround_h,
    round(s.p90_turnaround_h, 1)                            AS p90_turnaround_h,
    round(100 * s.parts_wait_share, 1)                      AS parts_wait_pct,
    round(100 * s.first_time_fix, 1)                        AS first_time_fix_pct,
    round(s.network_p50_h, 1)                               AS network_p50_h,
    round(100.0 * (s.p50_turnaround_h / s.network_p50_h - 1), 1) AS pct_vs_network,
    CASE
        WHEN s.jobs_closed < 8 THEN 'LOW VOLUME'
        WHEN s.p50_turnaround_h > 1.5 * s.network_p50_h
          OR s.p50_turnaround_h > 1.5 * s.trailing_4wk_p50_h THEN 'INTERVENE'
        WHEN s.p50_turnaround_h > 1.2 * s.network_p50_h       THEN 'WATCH'
        ELSE 'OK'
    END                                                     AS status
FROM scored s
JOIN markets m USING (market_id);

-- Latest 4 complete weeks vs the 13 weeks before: is each center getting better or worse?
CREATE OR REPLACE VIEW center_scorecard AS
WITH bounds AS (
    SELECT max(wk) AS last_wk FROM center_weekly
),
tagged AS (
    SELECT w.*,
        CASE WHEN w.wk >  b.last_wk - INTERVAL 4 WEEK  THEN 'recent'
             WHEN w.wk >  b.last_wk - INTERVAL 17 WEEK THEN 'prior' END AS period
    FROM center_weekly w, bounds b
)
SELECT
    center_id, center, market,
    sum(jobs_closed) FILTER (WHERE period = 'recent')                         AS jobs_4wk,
    round(avg(p50_turnaround_h) FILTER (WHERE period = 'recent'), 1)          AS p50_turnaround_4wk_h,
    round(avg(p50_turnaround_h) FILTER (WHERE period = 'prior'), 1)           AS p50_turnaround_prior_h,
    round(100.0 * (avg(p50_turnaround_h) FILTER (WHERE period = 'recent')
                 / avg(p50_turnaround_h) FILTER (WHERE period = 'prior') - 1), 1) AS turnaround_change_pct,
    round(avg(first_time_fix_pct) FILTER (WHERE period = 'recent'), 1)        AS first_time_fix_4wk_pct,
    round(avg(parts_wait_pct) FILTER (WHERE period = 'recent'), 1)            AS parts_wait_4wk_pct,
    round(avg(tech_utilization_pct) FILTER (WHERE period = 'recent'), 1)      AS tech_utilization_4wk_pct,
    count(*) FILTER (WHERE period = 'recent' AND status = 'INTERVENE')        AS intervene_weeks_4wk,
    count(*) FILTER (WHERE period = 'prior'  AND status = 'INTERVENE')        AS intervene_weeks_prior
FROM tagged
WHERE period IS NOT NULL
GROUP BY ALL
ORDER BY p50_turnaround_4wk_h DESC;

-- Open work at the snapshot, aged. Anything over 72h is a customer-facing problem.
CREATE OR REPLACE VIEW backlog AS
SELECT
    c.center, m.market, j.job_type,
    count(*)                                                                   AS open_jobs,
    count(*) FILTER (WHERE date_diff('hour', j.opened_at, snapshot_ts()) > 72) AS older_than_72h,
    round(max(date_diff('hour', j.opened_at, snapshot_ts())), 0)               AS oldest_h
FROM service_jobs j
JOIN service_centers c USING (center_id)
JOIN markets m ON m.market_id = c.market_id
WHERE j.closed_at IS NULL
GROUP BY ALL
ORDER BY older_than_72h DESC, open_jobs DESC;
