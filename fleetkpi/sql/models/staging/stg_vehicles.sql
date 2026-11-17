-- description: Vehicles with time in service, age, book value today and registration / insurance status
SELECT
    v.vehicle_id, v.powertrain, v.fuel_type, v.make, v.model, v.home_site_id, v.region, v.use_case,
    v.in_service_date, v.out_of_service_date, v.purchase_cost,
    v.registration_expiry, v.insurance_expiry, v.insurer,
    (v.out_of_service_date IS NULL OR v.out_of_service_date >= snapshot_date())
        AND v.in_service_date < snapshot_date()                                        AS is_active,
    date_diff('day', v.in_service_date,
              least(coalesce(v.out_of_service_date, snapshot_date()), snapshot_date())) AS days_in_service,
    date_diff('month', v.in_service_date, snapshot_date())                             AS age_months,
    book_value(v.purchase_cost, date_diff('month', v.in_service_date, snapshot_date())) AS book_value,
    doc_status(v.registration_expiry)                                                   AS registration_status,
    doc_status(v.insurance_expiry)                                                      AS insurance_status,
    date_diff('day', snapshot_date(), v.registration_expiry)                            AS registration_days_left,
    date_diff('day', snapshot_date(), v.insurance_expiry)                               AS insurance_days_left
FROM vehicles v
