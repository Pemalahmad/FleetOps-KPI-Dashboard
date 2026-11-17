-- description: Vehicle-month economics inside the KPI window: energy, maintenance, depreciation, CO2
SELECT vm.vehicle_id, vm.region, vm.powertrain, vm.month_start, vm.km, vm.days_in_service,
       e.fuel_l, e.kwh,
       coalesce(e.energy_cost, 0)                              AS energy_cost,
       coalesce(e.co2_kg, 0)                                   AS co2_kg,
       coalesce(e.energy_downtime_h, 0)                        AS energy_downtime_h,
       coalesce(m.maintenance_cost, 0)                         AS maintenance_cost,
       coalesce(vm.book_value_start - vm.book_value_end, 0)    AS depreciation
FROM int_vehicle_months vm
LEFT JOIN int_energy_vehicle_month e USING (vehicle_id, month_start)
LEFT JOIN int_maintenance_vehicle_month m USING (vehicle_id, month_start)
WHERE vm.month_start > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
