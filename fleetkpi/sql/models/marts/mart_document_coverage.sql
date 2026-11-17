-- description: Document coverage for active vehicles: how many have a registration card and an insurance policy on file, and in what status
SELECT region, doc_type,
       count(*)                                          AS vehicles,
       count(*) FILTER (WHERE on_file)                   AS on_file,
       round(100.0 * count(*) FILTER (WHERE on_file) / count(*), 1) AS coverage_pct,
       count(*) FILTER (WHERE status = 'Valid')          AS valid,
       count(*) FILTER (WHERE status = 'Expiring')       AS expiring,
       count(*) FILTER (WHERE status = 'Expired')        AS expired,
       count(*) FILTER (WHERE status = 'Unknown')        AS unknown
FROM (
    SELECT region, 'Registration' AS doc_type, registration_docs > 0 AS on_file, registration_status AS status FROM stg_vehicles WHERE is_active
    UNION ALL
    SELECT region, 'Insurance', insurance_docs > 0, insurance_status FROM stg_vehicles WHERE is_active
)
GROUP BY ALL
