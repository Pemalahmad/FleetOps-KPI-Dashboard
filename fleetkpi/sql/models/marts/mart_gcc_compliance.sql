-- description: Each active vehicle checked against its GCC country's published rules (stg_gcc_rules): one status (Non-compliant, Evidence missing, Expiring, Compliant, or Not covered outside the six countries) and the reasons in plain words. A check of the records on file, not a certification.
-- materialized: table
WITH docs AS (
    SELECT vehicle_id,
           max(expiry_date) FILTER (WHERE doc_type = 'Inspection') AS inspection_expiry,
           max(expiry_date) FILTER (WHERE is_tga_card)             AS permit_expiry,
           count(*) FILTER (WHERE is_tga_card)                     AS permits
    FROM (
        SELECT *, doc_type = 'Permit' AND regexp_matches(lower(coalesce(issuer, '')),
            '(^|[^a-z])(tga|naql)([^a-z]|$)|transport general authority|general transport authority|الهيئة العامة للنقل|منصة نقل') AS is_tga_card
        FROM stg_documents
    ) d WHERE vehicle_id IS NOT NULL GROUP BY 1
),
v AS (
    SELECT v.vehicle_id, v.plate_number, v.make, v.model, v.region, v.use_case,
           v.registration_expiry, v.registration_status, v.insurance_expiry, v.insurance_status,
           r.country_code, r.country, r.registration_name, r.authority, r.inspection_rule, r.renewal_note,
           r.operating_card_note, r.confidence, r.source_url, r.insurance_covers_registration,
           -- Age from the model year or the in-service date, whichever is older (inspection exemptions run from the earlier).
           greatest(CASE WHEN v.model_year IS NOT NULL THEN year(snapshot_date()) - v.model_year END,
                    CASE WHEN v.age_months IS NOT NULL THEN v.age_months / 12.0 END)         AS age_years,
           regexp_matches(lower(coalesce(v.use_case, '')), 'taxi|bus|school|public')         AS is_public,
           regexp_matches(lower(coalesce(v.use_case, '')), 'deliver|goods|truck|cargo|freight|logistic|haul|courier') AS is_goods,
           d.inspection_expiry, d.permit_expiry, coalesce(d.permits, 0) AS permits,
           r.inspection_from_years, r.inspection_from_years_public, r.inspection_from_years_commercial
    FROM stg_vehicles v
    LEFT JOIN stg_gcc_rules r ON regexp_full_match(lower(trim(coalesce(v.region, ''))), r.aliases)
    LEFT JOIN docs d USING (vehicle_id)
    WHERE v.is_active
),
rules AS (
    SELECT *,
           CASE WHEN country_code = 'SA' THEN CASE WHEN nullif(trim(use_case), '') IS NULL THEN NULL ELSE is_goods END
                ELSE FALSE END AS operating_card_required,
           CASE WHEN is_public AND inspection_from_years_public IS NOT NULL THEN inspection_from_years_public
                WHEN (is_public OR is_goods) AND inspection_from_years_commercial IS NOT NULL THEN inspection_from_years_commercial
                ELSE inspection_from_years END AS inspection_from
    FROM v
),
checks AS (
    SELECT *,
        -- level: 4 non-compliant, 3 evidence missing, 2 expiring, 0 fine
        CASE registration_status WHEN 'Expired' THEN 4 WHEN 'Unknown' THEN 3 WHEN 'Expiring' THEN 2 ELSE 0 END AS reg_level,
        CASE registration_status WHEN 'Expired' THEN registration_name || ' expired ' || strftime(registration_expiry, '%Y-%m-%d')
             WHEN 'Unknown' THEN registration_name || ': no expiry date on file'
             WHEN 'Expiring' THEN registration_name || ' expires ' || strftime(registration_expiry, '%Y-%m-%d') END AS reg_msg,
        CASE insurance_status WHEN 'Expired' THEN 4 WHEN 'Unknown' THEN 3 WHEN 'Expiring' THEN 2 ELSE 0 END AS ins_level,
        CASE insurance_status WHEN 'Expired' THEN 'Insurance expired ' || strftime(insurance_expiry, '%Y-%m-%d')
             WHEN 'Unknown' THEN 'Insurance: no expiry date on file'
             WHEN 'Expiring' THEN 'Insurance expires ' || strftime(insurance_expiry, '%Y-%m-%d') END AS ins_msg,
        -- Inspection is checked at renewal: it matters once the vehicle is old enough and the renewal is near.
        CASE WHEN inspection_from IS NULL OR registration_status NOT IN ('Expiring', 'Expired') THEN 0
             WHEN age_years IS NULL THEN 3
             WHEN age_years >= inspection_from AND (inspection_expiry IS NULL OR inspection_expiry < snapshot_date()) THEN 2
             ELSE 0 END AS insp_level,
        CASE WHEN inspection_from IS NULL OR registration_status NOT IN ('Expiring', 'Expired') THEN NULL
             WHEN age_years IS NULL THEN 'Inspection may be needed for renewal: add the model year or in-service date'
             WHEN age_years >= inspection_from AND (inspection_expiry IS NULL OR inspection_expiry < snapshot_date())
                  THEN 'Book the technical inspection before renewing (vehicle is ' || CAST(floor(age_years) AS INTEGER) || ' years old)' END AS insp_msg,
        CASE WHEN operating_card_required IS NULL OR (operating_card_required AND permits = 0) THEN 3
             WHEN operating_card_required THEN CASE doc_status(permit_expiry) WHEN 'Expired' THEN 4 WHEN 'Expiring' THEN 2 WHEN 'Unknown' THEN 3 ELSE 0 END
             ELSE 0 END AS card_level,
        CASE WHEN operating_card_required IS NULL THEN 'Record the vehicle use to determine whether a TGA operating card is required'
             WHEN country_code = 'SA' AND is_goods AND permits = 0 THEN 'TGA operating card not on file (goods-transport vehicle)'
             WHEN country_code = 'SA' AND is_goods AND doc_status(permit_expiry) = 'Expired' THEN 'TGA operating card expired'
             WHEN country_code = 'SA' AND is_goods AND doc_status(permit_expiry) = 'Expiring' THEN 'TGA operating card expires ' || strftime(permit_expiry, '%Y-%m-%d')
             WHEN country_code = 'SA' AND is_goods AND doc_status(permit_expiry) = 'Unknown' THEN 'TGA operating card: no expiry date on file' END AS card_msg,
        CASE WHEN insurance_covers_registration AND insurance_expiry < registration_expiry THEN 4 ELSE 0 END AS cover_level,
        CASE WHEN insurance_covers_registration AND insurance_expiry < registration_expiry
             THEN 'Insurance ends before the registration; it must cover the whole registration period' END AS cover_msg
    FROM rules
)
SELECT vehicle_id, plate_number, make, model, region, use_case, country_code, country, registration_name, authority,
       registration_expiry, insurance_expiry, inspection_expiry, permit_expiry,
       CAST(floor(age_years) AS INTEGER) AS age_years, inspection_from AS inspection_from_years,
       operating_card_required, insurance_covers_registration,
       CASE WHEN confidence <> 'low' AND inspection_from IS NOT NULL
            THEN registration_expiry - CAST(cfg_num('expiring_window_days') AS INTEGER) END AS inspection_review_from,
       CASE WHEN country_code IS NULL THEN 'Not covered'
            ELSE CASE greatest(reg_level, ins_level, insp_level, card_level, cover_level)
                 WHEN 4 THEN 'Non-compliant' WHEN 3 THEN 'Evidence missing' WHEN 2 THEN 'Expiring' ELSE 'Compliant' END END AS status,
       CASE WHEN country_code IS NULL THEN 'No GCC rule pack for this region'
            ELSE concat_ws(' · ', reg_msg, ins_msg, card_msg, insp_msg, cover_msg) END AS reasons,
       inspection_rule, renewal_note, operating_card_note, confidence, source_url
FROM checks
