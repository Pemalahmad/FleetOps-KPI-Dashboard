-- description: Fines registered against vehicles, with region, month and unpaid flag
SELECT f.fine_id, f.vehicle_id, f.date, date_trunc('month', f.date)::DATE AS month_start,
       f.fine_type, f.amount, f.status, f.authority, v.region, v.home_site_id,
       f.status <> 'Paid' AS is_unpaid
FROM fines f
JOIN vehicles v USING (vehicle_id)
