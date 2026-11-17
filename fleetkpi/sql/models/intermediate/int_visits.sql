-- description: Unplanned workshop visits with the gap to the previous visit and to the previous repair of the same issue (repeat logic)
-- materialized: table
WITH visits AS (
    -- every non-scheduled visit; recalls and preventive maintenance are planned, so they never count as a repeat
    SELECT w.*,
           lag(w.key_out_ts) OVER (PARTITION BY w.vehicle_id ORDER BY w.key_in_ts) AS prev_visit_out
    FROM stg_work_orders w
    WHERE w.job_type NOT IN ('Recall', 'Preventive maintenance')
),
repairs AS (
    -- fault repairs only: the same issue fixed again is a repeat repair
    SELECT work_order_id,
           lag(key_out_ts) OVER (PARTITION BY vehicle_id, issue_category ORDER BY key_in_ts) AS prev_same_issue_out
    FROM stg_work_orders
    WHERE job_type IN ('Repair', 'Warranty')
)
SELECT v.*, r.prev_same_issue_out,
       date_diff('day', v.prev_visit_out, v.key_in_ts)                                       AS days_since_prev_visit,
       -- an unplanned fault return (not a collision or puncture) inside the window
       v.job_type IN ('Repair', 'Warranty')
         AND coalesce(date_diff('day', v.prev_visit_out, v.key_in_ts) <= cfg_num('repeat_window_days'), FALSE) AS is_repeat_visit,
       v.job_type IN ('Repair', 'Warranty')
         AND (v.repeat_visit
              OR coalesce(date_diff('day', r.prev_same_issue_out, v.key_in_ts) <= cfg_num('repeat_window_days'), FALSE)) AS is_repeat_repair
FROM visits v
LEFT JOIN repairs r USING (work_order_id)
