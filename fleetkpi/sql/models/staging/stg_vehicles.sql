-- description: Vehicles with identity (VIN status, decoded year and make), time in service, age, book value and registration / insurance status (latest of the vehicle file and its documents)
-- materialized: table
WITH docs AS (
    SELECT vehicle_id,
           max(expiry_date) FILTER (WHERE doc_type = 'Registration') AS reg_doc_expiry,
           max(expiry_date) FILTER (WHERE doc_type = 'Insurance')    AS ins_doc_expiry,
           arg_max(issuer, expiry_date) FILTER (WHERE doc_type = 'Insurance') AS ins_doc_issuer,
           count(*) FILTER (WHERE doc_type = 'Registration')         AS registration_docs,
           count(*) FILTER (WHERE doc_type = 'Insurance')            AS insurance_docs,
           count(*)                                                  AS documents
    FROM stg_documents WHERE vehicle_id IS NOT NULL GROUP BY 1
),
v AS (
    SELECT v.* REPLACE (
               greatest(v.registration_expiry, d.reg_doc_expiry) AS registration_expiry,
               greatest(v.insurance_expiry, d.ins_doc_expiry)     AS insurance_expiry,
               CASE WHEN d.ins_doc_expiry > coalesce(v.insurance_expiry, DATE '1900-01-01')
                    THEN coalesce(d.ins_doc_issuer, v.insurer) ELSE v.insurer END AS insurer,
               coalesce(v.make, w.make)                            AS make,
               coalesce(v.model_year, vin_model_year(v.vin, snapshot_date())) AS model_year),
           coalesce(d.registration_docs, 0) AS registration_docs, coalesce(d.insurance_docs, 0) AS insurance_docs,
           coalesce(d.documents, 0) AS documents
    FROM vehicles v
    LEFT JOIN docs d USING (vehicle_id)
    LEFT JOIN ref_wmi w ON w.wmi = substr(v.vin, 1, 3)
)
SELECT
    v.vehicle_id, v.powertrain, v.fuel_type, v.make, v.model, v.home_site_id, v.region, v.use_case,
    v.in_service_date, v.out_of_service_date, v.purchase_cost,
    v.registration_expiry, v.insurance_expiry, v.insurer,
    v.vin, vin_status(v.vin) AS vin_status, v.plate_number, v.model_year, v.trim, v.configuration, v.color,
    coalesce(licence_norm(v.licence_class_required), required_licence(v.make, v.model)) AS licence_class_required,
    v.registration_docs, v.insurance_docs, v.documents,
    (v.out_of_service_date IS NULL OR v.out_of_service_date >= snapshot_date())
        AND coalesce(v.in_service_date < snapshot_date(), TRUE)                       AS is_active,
    date_diff('day', v.in_service_date,
              least(coalesce(v.out_of_service_date, snapshot_date()), snapshot_date())) AS days_in_service,
    date_diff('month', v.in_service_date, snapshot_date())                             AS age_months,
    book_value(v.purchase_cost, date_diff('month', v.in_service_date, snapshot_date())) AS book_value,
    doc_status(v.registration_expiry)                                                   AS registration_status,
    doc_status(v.insurance_expiry)                                                      AS insurance_status,
    date_diff('day', snapshot_date(), v.registration_expiry)                            AS registration_days_left,
    date_diff('day', snapshot_date(), v.insurance_expiry)                               AS insurance_days_left
FROM v
