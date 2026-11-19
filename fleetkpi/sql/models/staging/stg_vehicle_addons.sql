-- description: Equipment fitted beyond the base trim (chargers, battery packs, self-driving hardware, cameras, telematics, body fit-outs), with its own warranty status
SELECT a.vehicle_id, a.addon, coalesce(a.category, 'Other') AS category, a.installed_date, a.supplier, a.serial_number,
       a.software_version, a.cost, a.warranty_end, doc_status(a.warranty_end) AS addon_warranty_status,
       coalesce(a.category, '') = 'Self-driving' AS is_self_driving,
       coalesce(a.category, '') IN ('Charging', 'Battery & thermal') AS is_electric
FROM vehicle_addons a
