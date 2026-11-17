-- description: Documents (registration cards, policies, inspections, permits) matched to a vehicle by its id, plate or VIN
-- materialized: table
WITH keys AS (
    SELECT vehicle_id, upper(regexp_replace(vehicle_id, '[^A-Za-z0-9]', '', 'g')) AS k, 'vehicle_id' AS matched_by, 1 AS pri FROM vehicles
    UNION ALL
    SELECT vehicle_id, upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g')), 'plate', 2 FROM vehicles WHERE plate_number IS NOT NULL
    UNION ALL
    SELECT vehicle_id, vin, 'vin', 3 FROM vehicles WHERE vin IS NOT NULL
),
docs AS (
    SELECT d.*, upper(regexp_replace(d.vehicle_ref, '[^A-Za-z0-9]', '', 'g')) AS k FROM documents d
)
SELECT d.document_id, d.vehicle_ref, d.doc_type, d.document_number, d.issue_date, d.expiry_date, d.issuer, d.file_name,
       m.vehicle_id, m.matched_by,
       doc_status(d.expiry_date)                          AS status,
       date_diff('day', snapshot_date(), d.expiry_date)   AS days_left
FROM docs d
LEFT JOIN (SELECT * FROM keys QUALIFY row_number() OVER (PARTITION BY k ORDER BY pri) = 1) m USING (k)
