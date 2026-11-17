-- description: Energy cost and CO2 per km by powertrain and month
SELECT vm.powertrain, vm.month_start,
       round(sum(coalesce(e.energy_cost, 0)) / nullif(sum(vm.km), 0), 4)  AS energy_cost_per_km,
       round(1000 * sum(coalesce(e.co2_kg, 0)) / nullif(sum(vm.km), 0), 1) AS co2_g_per_km
FROM int_vehicle_months vm
LEFT JOIN int_energy_vehicle_month e USING (vehicle_id, month_start)
GROUP BY ALL
