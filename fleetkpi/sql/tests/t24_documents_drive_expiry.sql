-- description: A vehicle's registration and insurance expiry is never earlier than the latest matching document on file
-- severity: error
SELECT d.vehicle_id FROM stg_documents d JOIN stg_vehicles v USING (vehicle_id)
WHERE (d.doc_type = 'Registration' AND d.expiry_date > v.registration_expiry)
   OR (d.doc_type = 'Insurance' AND d.expiry_date > v.insurance_expiry)
