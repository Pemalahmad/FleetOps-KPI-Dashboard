-- description: Home site not found in sites
-- table: vehicles
-- needs: vehicles, sites
-- severity: error
SELECT v.vehicle_id || ' -> ' || v.home_site_id
FROM vehicles v LEFT JOIN sites s ON s.site_id = v.home_site_id
WHERE s.site_id IS NULL
