-- description: Cost per km (energy + maintenance + depreciation), efficiency and CO2 by powertrain, KPI window
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
FROM int_vehicle_month_economics
GROUP BY ALL
ORDER BY tco_per_km
