-- description: Book value never exceeds cost and never falls below the residual floor
-- severity: error
SELECT vehicle_id FROM stg_vehicles
WHERE book_value > purchase_cost + 0.01
   OR book_value < purchase_cost * cfg_num('residual_value_pct') / 100.0 - 0.01
