-- description: Drivers with licence status (valid, expiring, expired), days left, site and region
SELECT d.driver_id, coalesce(nullif(trim(d.driver_name), ''), d.driver_id) AS driver_name, d.licence_number, d.licence_class,
       d.licence_expiry, doc_status(d.licence_expiry) AS licence_status,
       date_diff('day', snapshot_date(), d.licence_expiry) AS licence_days_left,
       coalesce(d.home_site_id, v.home_site_id) AS home_site_id, d.vehicle_id,
       coalesce(s.region, v.region) AS region, d.status, d.status = 'Active' AS is_active
FROM drivers d
LEFT JOIN stg_vehicles v USING (vehicle_id)
LEFT JOIN stg_sites s ON s.site_id = coalesce(d.home_site_id, v.home_site_id)
