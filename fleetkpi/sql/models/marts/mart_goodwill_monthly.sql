-- description: Goodwill by region and month: amount waived, share of service spend and share of jobs with goodwill
SELECT vehicle_region AS region, date_trunc('month', opened_at)::DATE AS month_start,
       round(sum(total_cost), 0)                                       AS service_spend,
       round(sum(goodwill_amount), 0)                                  AS goodwill_amount,
       round(100.0 * sum(goodwill_amount) / nullif(sum(total_cost), 0), 2) AS goodwill_pct,
       round(100.0 * avg((goodwill_amount > 0)::INT), 1)               AS jobs_with_goodwill_pct
FROM stg_work_orders
WHERE opened_at < snapshot_ts()
GROUP BY ALL
