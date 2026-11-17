-- description: The metric network's identities hold exactly: north star = visit rate x hours per visit; hours per visit = workshop + pick-up + back to ops + open; availability = 1 - north star / hours in a month; first visits = visits x (1 - repeat share)
-- severity: error
SELECT region, month_start FROM mart_metric_panel
WHERE jobs > 0 AND (
      abs(offroad_h_per_vehicle_month - visits_per_vehicle_month * offroad_h_per_visit) > 1e-6
   OR abs(offroad_h_per_visit - (workshop_h_per_visit + pickup_h_per_visit + back_to_ops_h_per_visit + open_h_per_visit)) > 1e-6
   OR abs(availability_exact_pct - (100 - 100 * offroad_h_per_vehicle_month / (24 * 30.4375))) > 1e-6
   OR abs(first_visits_per_vehicle_month - visits_per_vehicle_month * (1 - repeat_share)) > 1e-6)
