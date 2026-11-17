-- description: Document whose vehicle reference matches no vehicle id, plate or VIN
-- table: documents
-- needs: documents, vehicles
-- severity: warning
WITH k AS (
    SELECT upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')) AS k
    FROM (SELECT vehicle_id AS x FROM vehicles UNION ALL SELECT plate_number FROM vehicles UNION ALL SELECT vin FROM vehicles)
    WHERE x IS NOT NULL
)
SELECT document_id FROM documents
WHERE upper(regexp_replace(vehicle_ref, '[^A-Za-z0-9]', '', 'g')) NOT IN (SELECT k FROM k)
