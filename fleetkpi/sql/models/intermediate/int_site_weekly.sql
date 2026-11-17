-- description: Weekly workshop performance per site with an INTERVENE / WATCH / OK flag (complete weeks, recalls excluded, 14-day warm-up)
WITH jobs AS (
    SELECT site_id,
           date_trunc('week', closed_at)::DATE           AS wk,
           count(*)                                      AS jobs_closed,
           median(turnaround_h)                          AS p50_turnaround_h,
           quantile_cont(turnaround_h, 0.9)              AS p90_turnaround_h,
           median(key_to_key_h)                          AS p50_key_to_key_h,
           avg((key_to_key_h <= cfg_num('key_to_key_target_h'))::INT) AS k2k_on_target,
           avg((coalesce(parts_wait_hours, 0) > 0)::INT) AS parts_wait_share,
           1 - avg(repeat_visit::INT)                    AS first_time_fix,
           sum(labour_hours)                             AS labour_h
    FROM stg_work_orders
    WHERE job_type <> 'Recall'
      AND closed_at <  date_trunc('week', snapshot_ts())
      AND closed_at >= cfg_text('analysis_start')::DATE + INTERVAL 14 DAY
    GROUP BY ALL
),
scored AS (
    SELECT j.*, s.site_name, s.region, s.technicians, s.productive_hours_per_day,
           median(j.p50_turnaround_h) FILTER (WHERE j.jobs_closed >= cfg_num('min_weekly_jobs'))
               OVER (PARTITION BY j.wk)                  AS network_p50_h,
           avg(j.p50_turnaround_h) OVER (PARTITION BY j.site_id ORDER BY j.wk
               ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS trailing_4wk_p50_h
    FROM jobs j JOIN stg_sites s USING (site_id)
)
SELECT
    site_id, site_name, region, wk, jobs_closed,
    round(p50_turnaround_h, 1)                                         AS p50_turnaround_h,
    round(p90_turnaround_h, 1)                                         AS p90_turnaround_h,
    round(p50_key_to_key_h, 1)                                         AS p50_key_to_key_h,
    round(100 * k2k_on_target, 1)                                      AS key_to_key_on_target_pct,
    round(100 * parts_wait_share, 1)                                   AS parts_wait_pct,
    round(100 * first_time_fix, 1)                                     AS first_time_fix_pct,
    round(100 * labour_h / nullif(productive_hours_per_day * cfg_num('working_days_per_week'), 0), 1) AS productivity_pct,
    round(network_p50_h, 1)                                            AS network_p50_h,
    round(100.0 * (p50_turnaround_h / network_p50_h - 1), 1)           AS pct_vs_network,
    CASE
        WHEN jobs_closed < cfg_num('min_weekly_jobs') THEN 'LOW VOLUME'
        -- a flag needs both a ratio and a real gap in hours, so small medians do not raise false alarms
        WHEN (p50_turnaround_h > cfg_num('intervene_ratio') * network_p50_h
              OR p50_turnaround_h > cfg_num('intervene_ratio') * trailing_4wk_p50_h)
         AND p50_turnaround_h - least(network_p50_h, coalesce(trailing_4wk_p50_h, network_p50_h)) >= cfg_num('intervene_min_gap_h')
            THEN 'INTERVENE'
        WHEN p50_turnaround_h > cfg_num('watch_ratio') * network_p50_h
         AND p50_turnaround_h - network_p50_h >= cfg_num('intervene_min_gap_h') / 2 THEN 'WATCH'
        ELSE 'OK'
    END                                                                AS status
FROM scored
