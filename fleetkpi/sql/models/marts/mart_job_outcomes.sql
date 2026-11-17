-- description: One row per closed work order: the three clocks, parts wait, repeat flags, cost, goodwill and (when given) the customer's rating, for job-level statistics
SELECT w.work_order_id, w.vehicle_region AS region, date_trunc('month', w.key_in_ts)::DATE AS month_start,
       w.job_type, w.issue_category, w.powertrain,
       w.key_to_key_h, w.workshop_h, w.time_to_pickup_h, w.back_to_ops_h, w.off_road_h, w.parts_wait_hours,
       coalesce(v.is_repeat_visit, FALSE) AS is_repeat_visit, coalesce(v.is_repeat_repair, FALSE) AS is_repeat_repair,
       coalesce(w.total_cost, 0) AS total_cost, coalesce(w.goodwill_amount, 0) AS goodwill_amount,
       w.goodwill_amount > 0 AS has_goodwill, f.rating, f.is_low
FROM stg_work_orders w
LEFT JOIN int_visits v USING (work_order_id)
LEFT JOIN (SELECT work_order_id, avg(rating) AS rating, bool_or(is_low) AS is_low
           FROM stg_feedback WHERE work_order_id IS NOT NULL GROUP BY 1) f USING (work_order_id)
WHERE w.key_to_key_h IS NOT NULL
