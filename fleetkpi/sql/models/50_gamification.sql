-- Gamification: a site Ops Score (0-1,000), tiers, rank movement, clean-week streaks and badges.
-- Built only from KPIs already defined above, so every point is explainable.

CREATE OR REPLACE VIEW site_periods AS
WITH b AS (SELECT max(wk) AS last_wk FROM center_weekly)
SELECT w.*, CASE WHEN w.wk >  b.last_wk - INTERVAL 4 WEEK THEN 'current'
                 WHEN w.wk >  b.last_wk - INTERVAL 8 WEEK THEN 'previous' END AS period
FROM center_weekly w, b;

CREATE OR REPLACE VIEW site_pm AS
SELECT v.home_site_id AS site_id,
       100.0 * count(*) FILTER (WHERE p.pm_state <> 'Overdue') / count(*) AS pm_compliance_pct
FROM pm_status p JOIN vehicles v USING (vehicle_id)
GROUP BY ALL;

CREATE OR REPLACE VIEW site_scores AS
WITH agg AS (
    SELECT site_id, site_name, region, period,
           sum(jobs_closed)                    AS jobs,
           avg(p50_turnaround_h)               AS p50_h,
           avg(network_p50_h)                  AS network_p50_h,
           avg(first_time_fix_pct)             AS ftf_pct,
           avg(same_day_release_pct)           AS same_day_pct
    FROM site_periods WHERE period IS NOT NULL
    GROUP BY ALL
),
w AS (SELECT component, weight FROM cfg_score_weights),
pts AS (
    SELECT a.*, coalesce(p.pm_compliance_pct, 100) AS pm_pct,
           -- each component scaled 0..1 across its realistic range before weighting:
           -- turnaround: 0.6x network speed = 0, 1.2x = full marks; first-time fix 85-97%;
           -- same-day release 50-90%; PM compliance 85-100%.
           least(greatest((a.network_p50_h / nullif(a.p50_h, 0) - 0.6) / 0.6, 0), 1)  AS s_turnaround,
           least(greatest((a.ftf_pct - 85) / 12.0, 0), 1)                           AS s_ftf,
           least(greatest((a.same_day_pct - 50) / 40.0, 0), 1)                      AS s_same_day,
           least(greatest((coalesce(p.pm_compliance_pct, 100) - 85) / 15.0, 0), 1)  AS s_pm
    FROM agg a LEFT JOIN site_pm p USING (site_id)
)
SELECT site_id, site_name, region, period, jobs,
       round(p50_h, 1) AS p50_turnaround_h, round(ftf_pct, 1) AS first_time_fix_pct,
       round(same_day_pct, 1) AS same_day_release_pct, round(pm_pct, 1) AS pm_compliance_pct,
       round(1000 * (
           coalesce((SELECT weight FROM w WHERE component = 'turnaround'), 0)       * s_turnaround +
           coalesce((SELECT weight FROM w WHERE component = 'first_time_fix'), 0)   * s_ftf +
           coalesce((SELECT weight FROM w WHERE component = 'same_day_release'), 0) * s_same_day +
           coalesce((SELECT weight FROM w WHERE component = 'pm_compliance'), 0)    * s_pm
       ) / nullif((SELECT sum(weight) FROM w), 0), 0) AS ops_score
FROM pts;

CREATE OR REPLACE VIEW site_streaks AS
WITH ordered AS (
    SELECT site_id, wk, status,
           max(CASE WHEN status = 'INTERVENE' THEN wk END) OVER (PARTITION BY site_id) AS last_intervene,
           min(wk) OVER (PARTITION BY site_id) AS first_wk,
           max(wk) OVER () AS last_wk
    FROM center_weekly
)
SELECT DISTINCT site_id,
       date_diff('week', coalesce(last_intervene, first_wk - INTERVAL 1 WEEK), last_wk) AS clean_streak_weeks,
       last_intervene
FROM ordered;

CREATE OR REPLACE VIEW leaderboard AS
WITH cur AS (SELECT * FROM site_scores WHERE period = 'current'),
prev AS (SELECT site_id, ops_score AS prev_score FROM site_scores WHERE period = 'previous'),
ranked AS (
    SELECT c.*, p.prev_score,
           rank() OVER (ORDER BY c.ops_score DESC)              AS rnk,
           rank() OVER (ORDER BY p.prev_score DESC NULLS LAST)  AS prev_rnk
    FROM cur c LEFT JOIN prev p USING (site_id)
),
bl AS (
    SELECT site_id, count(*) FILTER (WHERE date_diff('hour', opened_at, snapshot_ts()) > 72) AS stale_open
    FROM wo WHERE closed_at IS NULL GROUP BY ALL
)
SELECT r.rnk AS rank, r.site_name, r.region, r.ops_score,
       (SELECT tier FROM cfg_tiers WHERE min_score <= r.ops_score ORDER BY min_score DESC LIMIT 1) AS tier,
       CASE WHEN r.prev_score IS NULL THEN NULL ELSE r.prev_rnk - r.rnk END AS rank_change,
       CASE WHEN r.prev_score IS NULL THEN NULL ELSE r.ops_score - r.prev_score END AS score_change,
       s.clean_streak_weeks,
       r.p50_turnaround_h, r.first_time_fix_pct, r.same_day_release_pct, r.pm_compliance_pct, r.jobs,
       list_filter([
           CASE WHEN s.clean_streak_weeks >= 13 THEN 'Clean Quarter' END,
           CASE WHEN r.first_time_fix_pct >= 95 THEN 'Fix It Once' END,
           CASE WHEN r.p50_turnaround_h <= 0.85 * (SELECT median(p50_turnaround_h) FROM cur) THEN 'Speed Benchmark' END,
           CASE WHEN r.pm_compliance_pct >= 98 THEN 'PM Perfect' END,
           CASE WHEN coalesce(bl.stale_open, 0) = 0 THEN 'Backlog Zero' END,
           CASE WHEN r.ops_score - r.prev_score >= 60 THEN 'Comeback' END
       ], lambda x: x IS NOT NULL) AS badges,
       r.site_id
FROM ranked r
LEFT JOIN site_streaks s USING (site_id)
LEFT JOIN bl USING (site_id)
ORDER BY r.rnk;
