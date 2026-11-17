-- description: Site league table: rank, tier, movement, clean-week streak and badges
WITH cur AS (SELECT * FROM mart_site_scores WHERE period = 'current'),
prev AS (SELECT site_id, ops_score AS prev_score FROM mart_site_scores WHERE period = 'previous'),
ranked AS (
    SELECT c.*, p.prev_score,
           rank() OVER (ORDER BY c.ops_score DESC)              AS rnk,
           rank() OVER (ORDER BY p.prev_score DESC NULLS LAST)  AS prev_rnk
    FROM cur c LEFT JOIN prev p USING (site_id)
),
streak AS (
    SELECT site_id,
           date_diff('week', coalesce(max(wk) FILTER (WHERE status = 'INTERVENE'), min(wk) - INTERVAL 1 WEEK),
                     (SELECT max(wk) FROM int_site_weekly)) AS clean_streak_weeks
    FROM int_site_weekly GROUP BY ALL
),
bl AS (SELECT site_id, age_3_7d + age_7d_plus AS stale_open FROM mart_backlog)
SELECT r.rnk AS rank, r.site_name, r.region, r.ops_score,
       (SELECT tier FROM cfg_tiers WHERE min_score <= r.ops_score ORDER BY min_score DESC LIMIT 1) AS tier,
       CASE WHEN r.prev_score IS NULL THEN NULL ELSE r.prev_rnk - r.rnk END        AS rank_change,
       CASE WHEN r.prev_score IS NULL THEN NULL ELSE r.ops_score - r.prev_score END AS score_change,
       s.clean_streak_weeks,
       r.key_to_key_p50_h, r.first_time_fix_pct, r.csat_pct, r.productivity_pct, r.pm_compliance_pct, r.jobs,
       list_filter([
           CASE WHEN s.clean_streak_weeks >= 13 THEN 'Clean Quarter' END,
           CASE WHEN r.first_time_fix_pct >= 99.5 THEN 'Fix It Once' END,
           CASE WHEN r.key_to_key_p50_h <= 0.85 * (SELECT median(key_to_key_p50_h) FROM cur) THEN 'Speed Benchmark' END,
           CASE WHEN r.csat_pct >= 90 THEN 'Customer Favourite' END,
           CASE WHEN r.productivity_pct >= 85 THEN 'High Output' END,
           CASE WHEN r.pm_compliance_pct >= 98 THEN 'PM Perfect' END,
           CASE WHEN coalesce(bl.stale_open, 0) = 0 THEN 'Backlog Zero' END,
           CASE WHEN r.ops_score - r.prev_score >= 60 THEN 'Comeback' END
       ], lambda x: x IS NOT NULL) AS badges,
       r.site_id
FROM ranked r
LEFT JOIN streak s USING (site_id)
LEFT JOIN bl USING (site_id)
ORDER BY r.rnk
