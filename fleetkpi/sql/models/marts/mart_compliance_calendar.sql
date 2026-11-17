-- description: Registration and insurance renewals due per week for the next 13 weeks (plus overdue)
SELECT document,
       CASE WHEN expiry < snapshot_date() THEN snapshot_date() - 7
            ELSE date_trunc('week', expiry)::DATE END AS wk,
       expiry < snapshot_date()                         AS overdue,
       count(*)                                         AS vehicles
FROM (
    SELECT 'Registration' AS document, registration_expiry AS expiry FROM stg_vehicles WHERE is_active
    UNION ALL
    SELECT 'Insurance', insurance_expiry FROM stg_vehicles WHERE is_active
)
WHERE expiry IS NOT NULL AND expiry < snapshot_date() + INTERVAL 91 DAY
GROUP BY ALL
