-- description: Customer ratings attributed to a site and region (via the work order when linked)
SELECT
    f.feedback_id, f.work_order_id, f.date, date_trunc('month', f.date)::DATE AS month_start,
    f.rating, f.channel, f.comment,
    coalesce(f.vehicle_id, w.vehicle_id)                    AS vehicle_id,
    coalesce(f.site_id, w.site_id, v.home_site_id)          AS site_id,
    s.region,
    f.rating <= 2                                           AS is_low,
    f.rating >= 4                                           AS is_satisfied
FROM feedback f
LEFT JOIN work_orders w USING (work_order_id)
LEFT JOIN vehicles v ON v.vehicle_id = coalesce(f.vehicle_id, w.vehicle_id)
LEFT JOIN sites s ON s.site_id = coalesce(f.site_id, w.site_id, v.home_site_id)
WHERE f.rating BETWEEN 1 AND 5
