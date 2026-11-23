-- description: Every active vehicle has one GCC compliance row with a known status, and any vehicle not compliant says why
-- severity: error
SELECT v.vehicle_id FROM stg_vehicles v LEFT JOIN mart_gcc_compliance g USING (vehicle_id)
WHERE v.is_active AND (g.vehicle_id IS NULL
   OR g.status NOT IN ('Compliant', 'Expiring', 'Evidence missing', 'Non-compliant', 'Not covered')
   OR (g.status IN ('Expiring', 'Evidence missing', 'Non-compliant') AND coalesce(g.reasons, '') = ''))
