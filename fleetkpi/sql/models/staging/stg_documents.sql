-- description: Documents (registration cards, policies, inspections, permits) matched to a vehicle by its id, plate or VIN
-- materialized: table
-- A reference shaped like a VIN (17 letters and digits, no I, O or Q) is matched against VINs first, as the document
-- reader does; anything else tries fleet id, then plate, then VIN. If the best match points at two different vehicles
-- (one car's plate is another's fleet id, say) the document is left unattached as 'ambiguous' instead of guessing.
WITH keys AS (
    SELECT vehicle_id, upper(regexp_replace(vehicle_id, '[^A-Za-z0-9]', '', 'g')) AS k, 'vehicle_id' AS matched_by FROM vehicles
    UNION ALL
    SELECT vehicle_id, upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g')), 'plate' FROM vehicles WHERE plate_number IS NOT NULL
    UNION ALL
    SELECT vehicle_id, upper(regexp_replace(vin, '[^A-Za-z0-9]', '', 'g')), 'vin' FROM vehicles WHERE vin IS NOT NULL
),
docs AS (
    SELECT d.*, upper(regexp_replace(d.vehicle_ref, '[^A-Za-z0-9]', '', 'g')) AS k FROM documents d
),
candidates AS (
    SELECT d.document_id, k.vehicle_id, k.matched_by,
           CASE WHEN regexp_full_match(d.k, '[A-HJ-NPR-Z0-9]{17}')
                THEN CASE k.matched_by WHEN 'vin' THEN 1 WHEN 'vehicle_id' THEN 2 ELSE 3 END
                ELSE CASE k.matched_by WHEN 'vehicle_id' THEN 1 WHEN 'plate' THEN 2 ELSE 3 END END AS pri
    FROM docs d JOIN keys k USING (k)
),
best AS (
    SELECT document_id,
           CASE WHEN count(DISTINCT vehicle_id) = 1 THEN min(vehicle_id) END        AS vehicle_id,
           CASE WHEN count(DISTINCT vehicle_id) = 1 THEN min(matched_by) ELSE 'ambiguous' END AS matched_by
    FROM candidates
    WHERE pri = (SELECT min(c2.pri) FROM candidates c2 WHERE c2.document_id = candidates.document_id)
    GROUP BY document_id
)
SELECT d.document_id, d.vehicle_ref, d.doc_type, d.document_number, d.issue_date, d.expiry_date, d.issuer, d.file_name,
       d.inspection_result,
       b.vehicle_id, b.matched_by,
       doc_status(d.expiry_date)                          AS status,
       date_diff('day', snapshot_date(), d.expiry_date)   AS days_left
FROM docs d
LEFT JOIN best b USING (document_id)
