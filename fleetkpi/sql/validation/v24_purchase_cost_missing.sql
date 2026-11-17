-- description: Purchase cost missing: depreciation and book value cannot be calculated for these vehicles
-- table: vehicles
-- severity: warning
SELECT vehicle_id FROM vehicles WHERE purchase_cost IS NULL
