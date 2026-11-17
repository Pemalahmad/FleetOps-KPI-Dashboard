-- description: The fleet register: one row per vehicle with identity (VIN, plate, make, model, year, trim, configuration), compliance and documents, and its service record
-- materialized: table
WITH wo AS (
    SELECT vehicle_id, count(*) AS visits, count(*) FILTER (WHERE is_open) AS open_jobs,
           max(key_in_ts)::DATE AS last_visit, sum(coalesce(total_cost, 0)) AS service_spend
    FROM stg_work_orders GROUP BY 1
),
fi AS (SELECT vehicle_id, count(*) AS fines, sum(amount) FILTER (WHERE is_unpaid) AS unpaid_fines FROM stg_fines GROUP BY 1)
SELECT v.vehicle_id, v.vin, v.vin_status, v.plate_number, v.make, v.model, v.model_year, v.trim, v.configuration, v.color,
       v.powertrain, v.fuel_type, v.region, v.home_site_id, v.use_case, v.is_active, v.in_service_date, v.age_months,
       v.purchase_cost, v.book_value,
       v.registration_expiry, v.registration_status, v.registration_days_left,
       v.insurance_expiry, v.insurance_status, v.insurance_days_left, v.insurer,
       v.registration_docs, v.insurance_docs, v.documents,
       coalesce(wo.visits, 0) AS visits, coalesce(wo.open_jobs, 0) AS open_jobs, wo.last_visit,
       coalesce(wo.service_spend, 0) AS service_spend, coalesce(fi.fines, 0) AS fines, coalesce(fi.unpaid_fines, 0) AS unpaid_fines,
       -- one plain-language next action, most urgent first (law 6: the licence is a gate)
       CASE WHEN v.registration_status = 'Expired' THEN 'Ground: registration expired'
            WHEN v.insurance_status = 'Expired' THEN 'Ground: insurance expired'
            WHEN v.registration_status = 'Expiring' THEN 'Renew registration'
            WHEN v.insurance_status = 'Expiring' THEN 'Renew insurance'
            WHEN v.vin_status IN ('Invalid format', 'Check digit mismatch') THEN 'Check the VIN'
            WHEN v.registration_docs = 0 THEN 'Upload the registration card'
            WHEN v.insurance_docs = 0 AND v.insurance_expiry IS NULL THEN 'Upload the insurance policy'
            END AS next_action
FROM stg_vehicles v
LEFT JOIN wo USING (vehicle_id)
LEFT JOIN fi USING (vehicle_id)
