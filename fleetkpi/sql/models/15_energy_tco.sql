-- Energy, emissions and total cost of ownership, comparable across BEV, PHEV, HEV and ICE.

-- Every energy row priced (actual cost, or fleet.yml price) and converted to CO2.
CREATE OR REPLACE VIEW energy_priced AS
SELECT e.*, v.powertrain, v.region,
       date_trunc('month', e.date)::DATE AS month_start,
       coalesce(e.cost, e.quantity * CASE WHEN e.energy_type = 'electricity'
                                          THEN elec_price(v.region) ELSE fuel_price(v.region) END) AS cost_final,
       e.quantity * CASE WHEN e.energy_type = 'electricity' THEN grid_co2(v.region)
            ELSE coalesce((SELECT kg_per_litre FROM cfg_fuel_co2 WHERE fuel_type = coalesce(v.fuel_type, 'petrol')),
                          (SELECT kg_per_litre FROM cfg_fuel_co2 WHERE fuel_type = 'petrol')) END     AS co2_kg
FROM energy e
JOIN vehicles v USING (vehicle_id);

CREATE OR REPLACE VIEW energy_vehicle_month AS
SELECT vehicle_id, month_start,
       sum(quantity) FILTER (WHERE energy_type = 'fuel')        AS fuel_l,
       sum(quantity) FILTER (WHERE energy_type = 'electricity') AS kwh,
       sum(cost_final)                                          AS energy_cost,
       sum(co2_kg)                                              AS co2_kg,
       sum(duration_minutes) / 60.0                             AS energy_downtime_h
FROM energy_priced GROUP BY ALL;

-- Fleet-paid maintenance (excludes OEM-paid warranty and recall work).
CREATE OR REPLACE VIEW maintenance_vehicle_month AS
SELECT vehicle_id, date_trunc('month', opened_at)::DATE AS month_start,
       sum(total_cost) FILTER (WHERE paid_by = 'Fleet') AS maintenance_cost,
       count(*)                                          AS jobs
FROM wo GROUP BY ALL;

-- Vehicle-month economics inside the KPI window (last N complete months).
CREATE OR REPLACE VIEW vehicle_month_economics AS
SELECT vm.vehicle_id, vm.region, vm.powertrain, vm.month_start, vm.km, vm.days_in_service,
       e.fuel_l, e.kwh,
       coalesce(e.energy_cost, 0)                                   AS energy_cost,
       coalesce(e.co2_kg, 0)                                        AS co2_kg,
       coalesce(e.energy_downtime_h, 0)                             AS energy_downtime_h,
       coalesce(m.maintenance_cost, 0)                              AS maintenance_cost,
       coalesce(vm.purchase_cost / (cfg_num('depreciation_years') * 12) * vm.days_in_service / 30.0, 0) AS depreciation
FROM vehicle_months vm
LEFT JOIN energy_vehicle_month e USING (vehicle_id, month_start)
LEFT JOIN maintenance_vehicle_month m USING (vehicle_id, month_start)
WHERE vm.month_start > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER));

-- The comparison every fleet manager asks for: what does a km cost by powertrain?
CREATE OR REPLACE VIEW powertrain_kpis AS
SELECT powertrain,
       count(DISTINCT vehicle_id)                                                         AS vehicles,
       round(sum(km), 0)                                                                  AS km,
       round(100 * sum(fuel_l) / nullif(sum(km) FILTER (WHERE fuel_l IS NOT NULL), 0), 2) AS l_per_100km,
       round(100 * sum(kwh)    / nullif(sum(km) FILTER (WHERE kwh    IS NOT NULL), 0), 1) AS kwh_per_100km,
       round(sum(energy_cost)      / nullif(sum(km), 0), 4)                               AS energy_cost_per_km,
       round(sum(maintenance_cost) / nullif(sum(km), 0), 4)                               AS maintenance_cost_per_km,
       round(sum(depreciation)     / nullif(sum(km), 0), 4)                               AS depreciation_per_km,
       round((sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0), 4) AS tco_per_km,
       round(1000 * sum(co2_kg) / nullif(sum(km), 0), 1)                                  AS co2_g_per_km,
       round(sum(energy_downtime_h) / nullif(sum(days_in_service) / 30.0, 0), 1)          AS energy_downtime_h_per_vehicle_month
FROM vehicle_month_economics
GROUP BY ALL
ORDER BY tco_per_km;

-- Monthly trend of running cost per km by powertrain (full history).
CREATE OR REPLACE VIEW energy_monthly_powertrain AS
SELECT vm.powertrain, vm.month_start,
       round(sum(coalesce(e.energy_cost, 0)) / nullif(sum(vm.km), 0), 4) AS energy_cost_per_km,
       round(1000 * sum(coalesce(e.co2_kg, 0)) / nullif(sum(vm.km), 0), 1) AS co2_g_per_km
FROM vehicle_months vm
LEFT JOIN energy_vehicle_month e USING (vehicle_id, month_start)
GROUP BY ALL;

-- Per-vehicle total cost of ownership in the window: find the outliers.
CREATE OR REPLACE VIEW tco_vehicle AS
SELECT vehicle_id, region, powertrain,
       round(sum(km), 0)                       AS km,
       round(sum(energy_cost), 0)              AS energy_cost,
       round(sum(maintenance_cost), 0)         AS maintenance_cost,
       round(sum(depreciation), 0)             AS depreciation,
       round(sum(energy_cost) + sum(maintenance_cost) + sum(depreciation), 0) AS tco,
       round((sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0), 3) AS tco_per_km,
       round(1000 * sum(co2_kg) / nullif(sum(km), 0), 0) AS co2_g_per_km
FROM vehicle_month_economics
GROUP BY ALL;
