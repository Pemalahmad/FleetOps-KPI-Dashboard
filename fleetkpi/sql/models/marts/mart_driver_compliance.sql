-- description: Driver compliance profile: licence valid and of the class the assigned vehicle needs, fines (count, amount, unpaid) and tickets opened on the driver (jobs where they were at the wheel) or by the driver (jobs they reported), with a status and the reasons
WITH f AS (
    SELECT driver_id, count(*) AS fines, count(*) FILTER (WHERE date >= snapshot_date() - 365) AS fines_12m,
           sum(amount) AS fines_amount, coalesce(sum(amount) FILTER (WHERE is_unpaid), 0) AS unpaid_amount
    FROM stg_fines WHERE driver_id IS NOT NULL GROUP BY 1
),
t_on AS (
    SELECT driver_id, count(*) AS tickets_on, count(*) FILTER (WHERE job_type = 'Collision') AS collisions,
           count(*) FILTER (WHERE is_open) AS open_on
    FROM stg_work_orders WHERE driver_id IS NOT NULL GROUP BY 1
),
t_by AS (SELECT reported_by AS driver_id, count(*) AS tickets_by FROM stg_work_orders WHERE reported_by IS NOT NULL GROUP BY 1),
r AS (
    SELECT d.driver_id, d.driver_name, d.region, d.home_site_id, d.vehicle_id, v.plate_number, v.make, v.model,
           d.licence_number, d.licence_class, licence_norm(d.licence_class) AS licence_class_held, v.licence_class_required,
           licence_covers(licence_norm(d.licence_class), v.licence_class_required) AS class_ok,
           d.licence_expiry, d.licence_status, d.licence_days_left, d.is_active,
           coalesce(f.fines, 0) AS fines, coalesce(f.fines_12m, 0) AS fines_12m,
           coalesce(f.fines_amount, 0) AS fines_amount, coalesce(f.unpaid_amount, 0) AS unpaid_amount,
           coalesce(o.tickets_on, 0) AS tickets_on, coalesce(o.collisions, 0) AS collisions, coalesce(o.open_on, 0) AS open_tickets_on,
           coalesce(b.tickets_by, 0) AS tickets_by
    FROM stg_drivers d
    LEFT JOIN stg_vehicles v USING (vehicle_id)
    LEFT JOIN f USING (driver_id) LEFT JOIN t_on o USING (driver_id) LEFT JOIN t_by b USING (driver_id)
)
SELECT *,
       [x FOR x IN [
           CASE WHEN licence_status = 'Expired' THEN 'Licence expired' END,
           CASE WHEN class_ok = FALSE THEN 'Licence class ' || licence_class_held || ' does not cover ' || licence_class_required END,
           CASE WHEN licence_class IS NULL THEN 'Licence class not recorded' END,
           CASE WHEN licence_status = 'Unknown' THEN 'Licence expiry not recorded' END,
           CASE WHEN licence_status = 'Expiring' THEN 'Licence expires in ' || licence_days_left || ' days' END,
           CASE WHEN unpaid_amount >= cfg_num('alert_unpaid_fines_amount') THEN 'Unpaid fines ' || round(unpaid_amount)::INTEGER END
       ] IF x IS NOT NULL] AS issues,
       CASE WHEN licence_status = 'Expired' OR class_ok = FALSE THEN 'Not compliant'
            WHEN licence_status IN ('Expiring', 'Unknown') OR licence_class IS NULL
                 OR unpaid_amount >= cfg_num('alert_unpaid_fines_amount') THEN 'Action needed'
            ELSE 'Compliant' END AS compliance_status
FROM r
