-- description: Each active vehicle checked against its GCC country's published rules (stg_gcc_rules): one status (Non-compliant, Evidence missing, Expiring, Compliant, or Not covered outside the six countries) and the reasons in plain words. A check of the records on file, not a certification.
-- materialized: table
WITH failed_inspections AS (
    SELECT vehicle_id, max(issue_date) AS failed_on, count(*) FILTER (WHERE issue_date IS NULL) AS undated_failures
    FROM stg_documents
    WHERE vehicle_id IS NOT NULL AND doc_type = 'Inspection' AND inspection_result = 'Fail'
        AND (issue_date IS NULL OR issue_date <= snapshot_date())
    GROUP BY 1
),
dated_documents AS (
    SELECT *,
           doc_type = 'Inspection' AND expiry_date IS NOT NULL AND
               (issue_date IS NULL OR (issue_date <= snapshot_date() AND issue_date <= expiry_date)) AS is_inspection,
           regexp_matches(lower(coalesce(issuer, '')), 'dubai|(^|[^a-z])rta([^a-z]|$)|دبي|هيئة الطرق والمواصلات') AS is_dubai_inspection,
           doc_type = 'Permit' AND regexp_matches(lower(coalesce(issuer, '')),
               '(^|[^a-z])(tga|naql)([^a-z]|$)|transport general authority|general transport authority|الهيئة العامة للنقل|منصة نقل') AS is_tga_card
    FROM stg_documents LEFT JOIN failed_inspections USING (vehicle_id)
    WHERE vehicle_id IS NOT NULL
),
docs AS (
    SELECT vehicle_id,
           max(expiry_date) FILTER (WHERE is_inspection AND inspection_result IS DISTINCT FROM 'Fail') AS legacy_inspection_expiry,
           max(expiry_date) FILTER (WHERE is_pass) AS inspection_expiry,
           max(least(expiry_date, issue_date + 30)) FILTER (WHERE is_pass) AS inspection_30_day_expiry,
           max(least(expiry_date, issue_date + 30)) FILTER (WHERE is_pass AND is_dubai_inspection) AS dubai_inspection_expiry,
           max(issue_date) FILTER (WHERE is_pass) AS passed_on,
           max(issue_date) FILTER (WHERE is_pass AND is_dubai_inspection) AS dubai_passed_on,
           max(expiry_date) FILTER (WHERE is_tga_card)             AS permit_expiry,
           count(*) FILTER (WHERE is_tga_card)                     AS permits
    FROM (
        SELECT *, is_inspection AND inspection_result = 'Pass' AND issue_date IS NOT NULL
            AND (failed_on IS NULL OR issue_date > failed_on) AS is_pass
        FROM dated_documents
    ) d GROUP BY 1
),
v AS (
    SELECT v.vehicle_id, v.plate_number, v.make, v.model, v.region, v.use_case,
           v.registration_expiry, v.registration_status, v.insurance_expiry, v.insurance_status,
           nullif(trim(v.registration_class), '') AS registration_class,
           CASE WHEN v.manufacture_date <= snapshot_date() THEN v.manufacture_date END AS manufacture_date,
           CASE WHEN v.first_registration_date <= snapshot_date()
                AND (v.manufacture_date IS NULL OR v.manufacture_date <= v.first_registration_date)
                THEN v.first_registration_date END AS first_registered,
           v.registered_as_new, v.registration_weight_kg, v.vehicle_advertising,
           lower(trim(v.registration_owner_type)) AS registration_owner_type,
           lower(trim(coalesce(nullif(v.registration_jurisdiction, ''), v.region))) AS registration_jurisdiction,
           CASE WHEN v.inspection_due_date >= coalesce(v.first_registration_date, v.manufacture_date, DATE '1900-01-01')
                AND nullif(trim(v.inspection_schedule_reference), '') IS NOT NULL THEN v.inspection_due_date END AS authority_due,
           nullif(trim(v.inspection_schedule_reference), '') AS inspection_schedule_reference,
           coalesce(v.inspection_required_by_authority, FALSE) AS inspection_required_by_authority,
           r.country_code, r.country, r.registration_name, r.authority, r.inspection_rule, r.renewal_note,
           r.operating_card_note, r.confidence, r.source_url, r.insurance_covers_registration,
           regexp_matches(lower(coalesce(v.use_case, '')), 'deliver|goods|truck|cargo|freight|logistic|haul|courier') AS is_goods,
           d.legacy_inspection_expiry, d.inspection_expiry, d.inspection_30_day_expiry, d.dubai_inspection_expiry,
           d.passed_on, d.dubai_passed_on, f.failed_on, f.undated_failures,
           d.permit_expiry, coalesce(d.permits, 0) AS permits,
           c.class_rule
    FROM stg_vehicles v
    LEFT JOIN stg_gcc_rules r ON regexp_full_match(lower(trim(coalesce(v.region, ''))), r.aliases)
    LEFT JOIN stg_gcc_inspection_classes c ON c.country_code = r.country_code
        AND regexp_full_match(trim(regexp_replace(lower(v.registration_class), '[[:space:]]+', ' ', 'g')), c.aliases)
    LEFT JOIN docs d USING (vehicle_id)
    LEFT JOIN failed_inspections f USING (vehicle_id)
    WHERE v.is_active
),
applicability AS (
    SELECT *,
           CASE WHEN country_code = 'SA' THEN CASE WHEN nullif(trim(use_case), '') IS NULL THEN NULL ELSE is_goods END
                ELSE FALSE END AS operating_card_required,
           CASE WHEN country_code = 'BH' THEN
               CASE
                   WHEN regexp_full_match(lower(registration_class),
                        'private( car| vehicle)?|خصوصي|خصوصى|السيارة الخاصة|سيارة خاصة|السيارات الخاصة|سيارات خاصة')
                       THEN 'private'
                   WHEN regexp_full_match(lower(registration_class),
                        'private transport( for passengers| vehicle)?|private passenger transport|private bus|tourist car|' ||
                        'special[ -](use|purpose)( vehicle)?|commercial( vehicle)?|public transport|taxi|tractor( unit)?|' ||
                        'construction and agricultural vehicle|trailer|semi[ -]trailer|motorcycle|' ||
                        'سيار(ة|ات) (نقل خاص( للركاب)?|سياحية|ذات استعمال خاص)|النقل الخاص( للركاب)?|نقل خاص( للركاب)?|' ||
                        'باص خاص|سيارات النقل الخاص( للركاب)?|السيارات ذات الاستعمال الخاص|أجرة|نقل عام|القاطرة|قاطرة|' ||
                        'المركبة الإنشائية والزراعية|المقطورة|مقطورة|نصف المقطورة|نصف مقطورة|الدراجة الآلية|دراجة آلية|الدراجات الآلية')
                       THEN 'other'
               END
           END AS bahrain_registration_group,
           CASE WHEN country_code = 'BH' AND manufacture_date <= snapshot_date()
                THEN CAST(manufacture_date + INTERVAL 5 YEAR AS DATE) END AS bahrain_inspection_after
    FROM v
),
class_facts AS (
    SELECT *,
           registration_expiry - CAST(cfg_num('expiring_window_days') AS INTEGER) AS inspection_review_from,
           country_code = 'AE' AND registration_jurisdiction IN ('dubai', 'dxb', 'rta', 'دبي') AS dubai,
           CASE
               WHEN country_code = 'AE' THEN CASE
                   WHEN registration_jurisdiction IN ('dubai', 'dxb', 'rta', 'دبي') THEN 'Dubai'
                   WHEN regexp_full_match(registration_jurisdiction,
                       'abu dhabi|ad|أبو ظبي|أبوظبي|al ain|العين|sharjah|الشارقة|ajman|عجمان|ras al khaimah|rak|رأس الخيمة|fujairah|الفجيرة|umm al quwain|أم القيوين')
                       THEN registration_jurisdiction
               END
           END AS issuing_emirate,
           CASE
               WHEN class_rule = 'ae_private_light' OR
                    (class_rule IN ('ae_light', 'ae_light_service') AND snapshot_date() >= DATE '2027-01-01') THEN 3
               WHEN class_rule IN ('ae_other', 'ae_light_service') THEN 1
               WHEN class_rule = 'sa_private' OR class_rule = 'qa_private' THEN 3
               WHEN class_rule = 'sa_public' THEN 2
               WHEN class_rule = 'qa_private_transport' AND registration_weight_kg > 0 AND registration_weight_kg < 3000
                    AND registration_owner_type IN ('individual', 'person', 'فرد', 'أفراد', 'شخص طبيعي') THEN 3
           END AS first_licence_years
    FROM applicability
),
thresholds AS (
    SELECT *,
           CAST(first_registered + to_years(first_licence_years) AS DATE) AS first_licence_anniversary,
           CASE WHEN dubai AND manufacture_date IS NOT NULL AND first_registered IS NOT NULL THEN
               make_date(least(year(manufacture_date), year(first_registered)) + first_licence_years, 1, 1)
           END AS dubai_initial_limit,
           CASE WHEN country_code = 'AE' AND snapshot_date() < DATE '2027-01-01' THEN DATE '2026-12-31' END AS inspection_rule_until,
           CASE WHEN dubai AND class_rule <> 'ae_private_light' THEN dubai_inspection_expiry
                WHEN country_code = 'QA' OR dubai THEN inspection_30_day_expiry
                WHEN country_code = 'BH' AND failed_on IS NULL THEN legacy_inspection_expiry
                ELSE inspection_expiry END AS valid_inspection_expiry,
           coalesce(undated_failures, 0) > 0 OR
               (failed_on IS NOT NULL AND CASE WHEN dubai AND class_rule <> 'ae_private_light'
                                             THEN dubai_passed_on IS NULL ELSE passed_on IS NULL END) AS inspection_failed,
           country_code = 'SA' OR (class_rule IN ('kw_private', 'kw_private_transport') AND authority_due IS NOT NULL) AS periodic_inspection,
           CASE
               WHEN country_code = 'AE' AND snapshot_date() >= DATE '2027-01-01' THEN 'https://uaelegislation.gov.ae/ar/legislations/4658'
               WHEN dubai THEN 'https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=455'
               ELSE source_url
           END AS inspection_source_url
    FROM class_facts
),
inspection AS (
    SELECT *,
           CASE
               WHEN class_rule IN ('ae_confirmation', 'sa_confirmation', 'qa_confirmation', 'kw_private', 'kw_private_transport', 'om_confirmation')
                    THEN authority_due
               WHEN class_rule = 'qa_private_transport' AND registration_weight_kg = 3000 THEN authority_due
               WHEN class_rule = 'ae_light' AND snapshot_date() < DATE '2027-01-01' AND registered_as_new IS DISTINCT FROM FALSE
                    THEN authority_due
               WHEN first_licence_years IS NOT NULL AND (registered_as_new IS DISTINCT FROM FALSE OR class_rule = 'sa_public') THEN
                    CASE WHEN dubai THEN least(authority_due, first_licence_anniversary, dubai_initial_limit)
                         ELSE first_licence_anniversary END
               WHEN class_rule = 'om_age' OR (class_rule = 'om_light_commercial' AND vehicle_advertising IS FALSE)
                    THEN CAST(manufacture_date + INTERVAL 10 YEAR AS DATE)
           END AS inspection_starts_on,
           CASE
               WHEN country_code IN ('AE', 'SA', 'QA', 'KW', 'OM') AND class_rule IS NULL
                    THEN 'Record the official registration class to determine inspection applicability'
               WHEN inspection_required_by_authority THEN NULL
               WHEN class_rule IN ('ae_confirmation', 'sa_confirmation', 'qa_confirmation', 'kw_private', 'kw_private_transport', 'om_confirmation')
                    OR (class_rule = 'ae_light' AND snapshot_date() < DATE '2027-01-01' AND registered_as_new IS DISTINCT FROM FALSE) THEN
                    CASE WHEN authority_due IS NULL THEN
                         'Add the next inspection date and reference from the licensing authority for this registration class' END
               WHEN class_rule = 'qa_private_transport' AND
                    (registration_weight_kg IS NULL OR registration_weight_kg <= 0 OR (registration_weight_kg = 3000 AND authority_due IS NULL) OR
                     (registration_weight_kg < 3000 AND coalesce(registration_owner_type, '') NOT IN
                         ('individual', 'person', 'company', 'corporate', 'business', 'فرد', 'أفراد', 'شخص طبيعي', 'شركة', 'مؤسسة')))
                    THEN 'Verify the Private transport weight category and owner type on the Istimara and with FAHES'
               WHEN class_rule = 'om_light_commercial' AND vehicle_advertising IS NULL AND
                    (manufacture_date IS NULL OR snapshot_date() < manufacture_date + INTERVAL 10 YEAR)
                    THEN 'Record whether this commercial light vehicle is used for advertising'
               WHEN (class_rule = 'om_age' OR (class_rule = 'om_light_commercial' AND vehicle_advertising IS FALSE))
                    AND manufacture_date IS NULL THEN 'Add the actual manufacture date from the vehicle records'
               WHEN first_licence_years IS NOT NULL AND (registered_as_new IS DISTINCT FROM FALSE OR class_rule = 'sa_public') THEN
                    CASE
                        WHEN first_registered IS NULL THEN 'Add the original first licensing date from the registration record'
                        WHEN snapshot_date() < first_licence_anniversary AND class_rule <> 'sa_public' AND registered_as_new IS NULL
                             THEN 'Record whether the vehicle was new when first licensed'
                        WHEN snapshot_date() < first_licence_anniversary AND country_code = 'AE' AND issuing_emirate IS NULL
                             THEN 'Add the issuing emirate from the registration card'
                        WHEN dubai AND snapshot_date() < first_licence_anniversary
                             AND (dubai_initial_limit IS NULL OR snapshot_date() < dubai_initial_limit)
                             AND authority_due IS NULL
                             THEN 'Add the first inspection due date and reference verified with Dubai RTA'
                    END
           END AS inspection_applicability_gap
    FROM thresholds
),
inspection_status AS (
    SELECT *,
           country_code = 'BH' AND (inspection_required_by_authority OR (
               snapshot_date() >= inspection_review_from AND
               (bahrain_registration_group = 'other' OR
                   (bahrain_registration_group = 'private' AND snapshot_date() > bahrain_inspection_after))
           )) AS bahrain_inspection_due,
           inspection_required_by_authority OR (
               (periodic_inspection OR snapshot_date() >= inspection_review_from)
               AND (inspection_starts_on IS NULL OR snapshot_date() >= inspection_starts_on)
           ) AS gcc_inspection_due
    FROM inspection
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
        CASE WHEN country_code IS NOT NULL AND inspection_failed THEN 4
             WHEN country_code = 'BH' THEN
                  CASE WHEN bahrain_registration_group IS NULL THEN 3
                       WHEN bahrain_registration_group = 'private' AND bahrain_inspection_after IS NULL
                            AND NOT inspection_required_by_authority THEN 3
                       WHEN bahrain_inspection_due AND coalesce(valid_inspection_expiry < snapshot_date(), TRUE) THEN 3
                       ELSE 0 END
             WHEN country_code IS NULL THEN 0
             WHEN class_rule IS NULL THEN 3
             WHEN valid_inspection_expiry >= snapshot_date() THEN 0
             WHEN inspection_applicability_gap IS NOT NULL OR gcc_inspection_due THEN 3
             ELSE 0 END AS insp_level,
        CASE WHEN country_code IS NOT NULL AND inspection_failed THEN 'Technical inspection failed. Record a passing reinspection before release'
             WHEN country_code = 'BH' THEN
                  CASE WHEN bahrain_registration_group IS NULL
                            THEN 'Record the official Bahrain registration class to determine inspection applicability'
                       WHEN bahrain_registration_group = 'private' AND bahrain_inspection_after IS NULL
                            AND NOT inspection_required_by_authority THEN 'Record the actual manufacture date to determine the Bahrain Private inspection exemption'
                       WHEN bahrain_inspection_due AND coalesce(valid_inspection_expiry < snapshot_date(), TRUE)
                            THEN CASE WHEN inspection_required_by_authority THEN 'Add current technical inspection evidence required by Bahrain Traffic'
                                      ELSE 'Add current Bahrain technical inspection evidence for renewal' END END
             WHEN country_code IS NULL THEN NULL
             WHEN class_rule IS NULL THEN inspection_applicability_gap
             WHEN valid_inspection_expiry >= snapshot_date() THEN NULL
             WHEN inspection_applicability_gap IS NOT NULL THEN inspection_applicability_gap
             WHEN inspection_required_by_authority THEN 'Add current technical inspection evidence required by the licensing authority'
             WHEN gcc_inspection_due AND periodic_inspection THEN 'Add current periodic technical inspection evidence'
             WHEN gcc_inspection_due THEN 'Add current technical inspection evidence for renewal'
        END AS insp_msg,
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
    FROM inspection_status
)
SELECT vehicle_id, plate_number, make, model, region, use_case, country_code, country, registration_name, authority,
       registration_expiry, insurance_expiry, valid_inspection_expiry AS inspection_expiry, permit_expiry,
       class_rule AS registration_class_rule, inspection_starts_on, inspection_applicability_gap, periodic_inspection,
       CASE WHEN authority_due IS NOT NULL THEN inspection_schedule_reference END AS inspection_schedule_reference,
       inspection_rule_until, inspection_source_url, inspection_failed, failed_on AS inspection_failed_on,
       first_registered, manufacture_date, registered_as_new, registration_jurisdiction,
       registration_owner_type, registration_weight_kg, vehicle_advertising,
       registration_class, bahrain_registration_group, bahrain_inspection_after, inspection_required_by_authority,
       operating_card_required, insurance_covers_registration,
       inspection_review_from,
       CASE WHEN country_code IS NULL THEN 'Not covered'
            ELSE CASE greatest(reg_level, ins_level, insp_level, card_level, cover_level)
                 WHEN 4 THEN 'Non-compliant' WHEN 3 THEN 'Evidence missing' WHEN 2 THEN 'Expiring' ELSE 'Compliant' END END AS status,
       CASE WHEN country_code IS NULL THEN 'No GCC rule pack for this region'
            ELSE concat_ws(' · ', reg_msg, ins_msg, card_msg, insp_msg, cover_msg) END AS reasons,
       inspection_rule, renewal_note, operating_card_note, confidence, source_url
FROM checks
