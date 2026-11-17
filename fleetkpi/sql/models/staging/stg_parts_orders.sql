-- description: Parts orders with lead time, promised vs actual arrival, days late and open / overdue flags
SELECT
    p.part_order_id, p.work_order_id, p.part_description, coalesce(p.supplier, 'Unknown') AS supplier,
    p.ordered_at, p.promised_eta, p.arrived_at,
    w.site_id, w.vehicle_id, v.region,
    p.arrived_at IS NULL                                                     AS is_open,
    p.arrived_at IS NULL AND p.promised_eta < snapshot_ts()                  AS is_overdue,
    date_diff('minute', p.ordered_at, p.promised_eta) / 1440.0               AS promised_lead_days,
    date_diff('minute', p.ordered_at, p.arrived_at) / 1440.0                 AS actual_lead_days,
    CASE WHEN p.arrived_at IS NOT NULL THEN p.arrived_at <= p.promised_eta END AS on_time,
    greatest(date_diff('minute', p.promised_eta, coalesce(p.arrived_at, snapshot_ts())) / 1440.0, 0) AS days_late
FROM parts_orders p
LEFT JOIN work_orders w USING (work_order_id)
LEFT JOIN vehicles v ON v.vehicle_id = w.vehicle_id
