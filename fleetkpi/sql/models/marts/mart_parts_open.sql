-- description: Parts still on order at the snapshot, most overdue first: the vehicles waiting on a promise
SELECT p.part_order_id, p.work_order_id, p.vehicle_id, p.region, s.site_name, p.supplier, p.part_description,
       p.ordered_at, p.promised_eta, p.is_overdue, round(p.days_late, 1) AS days_overdue
FROM stg_parts_orders p
LEFT JOIN stg_sites s USING (site_id)
WHERE p.is_open
ORDER BY p.days_late DESC
