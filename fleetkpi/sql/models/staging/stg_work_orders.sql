-- description: Work orders with workshop turnaround (open to close) and key-to-key time (key in to key back)
SELECT
    w.work_order_id, w.vehicle_id, w.site_id, w.job_type, w.opened_at, w.closed_at,
    w.labour_hours, w.parts_wait_hours, w.total_cost, w.paid_by, w.repeat_visit, w.campaign_id,
    v.powertrain, v.region                                                    AS vehicle_region,
    w.closed_at IS NULL                                                       AS is_open,
    date_diff('minute', w.opened_at, w.closed_at) / 60.0                      AS turnaround_h,
    coalesce(w.key_in_at, w.opened_at)                                        AS key_in_ts,
    coalesce(w.key_out_at, w.closed_at)                                       AS key_out_ts,
    date_diff('minute', coalesce(w.key_in_at, w.opened_at),
                        coalesce(w.key_out_at, w.closed_at)) / 60.0          AS key_to_key_h
FROM work_orders w
JOIN vehicles v USING (vehicle_id)
