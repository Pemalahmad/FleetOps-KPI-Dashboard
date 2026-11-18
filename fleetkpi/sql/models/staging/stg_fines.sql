-- description: Fines registered against vehicles, with region, month, unpaid flag and the responsible driver (named on the fine, else the driver on a trip that day, else the vehicle's assigned driver)
SELECT f.fine_id, f.vehicle_id, f.date, date_trunc('month', f.date)::DATE AS month_start,
       f.fine_type, f.amount, f.status, f.authority, v.region, v.home_site_id,
       f.status <> 'Paid' AS is_unpaid,
       coalesce(f.driver_id, t.driver_id, a.driver_id) AS driver_id,
       CASE WHEN f.driver_id IS NOT NULL THEN 'named on the fine' WHEN t.driver_id IS NOT NULL THEN 'driving that day'
            WHEN a.driver_id IS NOT NULL THEN 'assigned driver' END AS driver_source
FROM fines f
JOIN vehicles v USING (vehicle_id)
LEFT JOIN (SELECT vehicle_id, start_ts::DATE AS d0, coalesce(end_ts, start_ts)::DATE AS d1, driver_id FROM trips WHERE driver_id IS NOT NULL) t
       ON t.vehicle_id = f.vehicle_id AND f.date BETWEEN t.d0 AND t.d1
LEFT JOIN (SELECT vehicle_id, min(driver_id) AS driver_id FROM drivers WHERE vehicle_id IS NOT NULL GROUP BY 1) a USING (vehicle_id)
QUALIFY row_number() OVER (PARTITION BY f.fine_id ORDER BY t.d0 DESC NULLS LAST) = 1
