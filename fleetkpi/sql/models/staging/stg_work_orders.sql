-- description: Work orders with the three clocks (key-to-key, workshop, fleet), time to pick up, back to operations, issue category and goodwill
-- materialized: table
SELECT
    w.work_order_id, w.vehicle_id, w.site_id, w.job_type, w.opened_at, w.closed_at,
    w.labour_hours, w.parts_wait_hours, w.total_cost, w.paid_by, w.repeat_visit, w.campaign_id,
    w.driver_id, w.reported_by,
    coalesce(w.goodwill_amount, 0)                                            AS goodwill_amount,
    coalesce(w.issue_category, CASE w.job_type
        WHEN 'Preventive maintenance' THEN 'Scheduled service' WHEN 'Tyres' THEN 'Tyres & wheels'
        WHEN 'Collision' THEN 'Body & glass' WHEN 'Recall' THEN 'Recall campaign'
        ELSE 'Uncategorised' END)                                             AS issue_category,
    v.powertrain, v.region                                                    AS vehicle_region,
    w.closed_at IS NULL                                                       AS is_open,
    coalesce(w.key_in_at, w.opened_at)                                        AS key_in_ts,
    coalesce(w.ready_at, w.closed_at)                                         AS ready_ts,
    coalesce(w.key_out_at, w.closed_at)                                       AS key_out_ts,
    coalesce(w.back_in_service_at, w.key_out_at, w.closed_at)                 AS back_in_service_ts,
    date_diff('minute', w.opened_at, w.closed_at) / 60.0                      AS turnaround_h,
    -- the customer's clock: key handed in -> key handed back
    date_diff('minute', coalesce(w.key_in_at, w.opened_at), coalesce(w.key_out_at, w.closed_at)) / 60.0 AS key_to_key_h,
    -- the workshop's clock: key in -> vehicle ready
    date_diff('minute', coalesce(w.key_in_at, w.opened_at), coalesce(w.ready_at, w.closed_at)) / 60.0   AS workshop_h,
    -- ready -> customer collects
    date_diff('minute', coalesce(w.ready_at, w.closed_at), coalesce(w.key_out_at, w.closed_at)) / 60.0  AS time_to_pickup_h,
    -- collected -> earning again
    date_diff('minute', coalesce(w.key_out_at, w.closed_at),
                        coalesce(w.back_in_service_at, w.key_out_at, w.closed_at)) / 60.0             AS back_to_ops_h,
    -- the fleet's clock: key in -> back in operations
    date_diff('minute', coalesce(w.key_in_at, w.opened_at),
                        coalesce(w.back_in_service_at, w.key_out_at, w.closed_at)) / 60.0             AS off_road_h
FROM work_orders w
JOIN vehicles v USING (vehicle_id)
