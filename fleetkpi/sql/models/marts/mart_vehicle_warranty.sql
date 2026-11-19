-- description: One row per vehicle: overall warranty position (Covered, Expiring, Partly covered, Out of warranty, Unknown), the next cover to end, and its add-ons (count, value, self-driving and electric equipment)
-- materialized: table
WITH w AS (
    SELECT vehicle_id, count(*) AS coverages,
           count(*) FILTER (WHERE warranty_status IN ('Active', 'Expiring')) AS coverages_active,
           max(warranty_status) FILTER (WHERE coverage ILIKE 'basic%') AS basic_status,
           max(warranty_status) FILTER (WHERE coverage ILIKE '%battery%') AS battery_status,
           arg_min(coverage, end_date) FILTER (WHERE warranty_status IN ('Active', 'Expiring')) AS next_to_end,
           min(end_date) FILTER (WHERE warranty_status IN ('Active', 'Expiring')) AS next_end_date,
           count(*) FILTER (WHERE warranty_status = 'Void') AS void_coverages
    FROM stg_warranties GROUP BY 1
),
a AS (
    SELECT vehicle_id, count(*) AS addons, sum(cost) AS addons_value, bool_or(is_self_driving) AS self_driving,
           count(*) FILTER (WHERE is_electric) AS electric_addons, max(software_version) FILTER (WHERE is_self_driving) AS self_driving_software
    FROM stg_vehicle_addons GROUP BY 1
)
SELECT v.vehicle_id, v.region, v.make, v.model, v.powertrain,
       CASE WHEN w.vehicle_id IS NULL THEN 'Unknown'
            WHEN w.basic_status = 'Active' THEN 'Covered'
            WHEN w.basic_status = 'Expiring' THEN 'Expiring'
            WHEN w.coverages_active > 0 THEN 'Partly covered'
            ELSE 'Out of warranty' END AS warranty_position,
       coalesce(w.coverages, 0) AS coverages, coalesce(w.coverages_active, 0) AS coverages_active,
       w.basic_status, w.battery_status, w.next_to_end, w.next_end_date, coalesce(w.void_coverages, 0) AS void_coverages,
       coalesce(a.addons, 0) AS addons, coalesce(a.addons_value, 0) AS addons_value, coalesce(a.self_driving, FALSE) AS self_driving,
       coalesce(a.electric_addons, 0) AS electric_addons, a.self_driving_software
FROM stg_vehicles v
LEFT JOIN w USING (vehicle_id)
LEFT JOIN a USING (vehicle_id)
WHERE v.is_active
