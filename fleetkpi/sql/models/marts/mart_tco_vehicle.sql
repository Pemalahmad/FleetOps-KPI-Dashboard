-- description: Total cost of ownership per vehicle in the KPI window
SELECT vehicle_id, region, powertrain,
       round(sum(km), 0)                       AS km,
       round(sum(energy_cost), 0)              AS energy_cost,
       round(sum(maintenance_cost), 0)         AS maintenance_cost,
       round(sum(depreciation), 0)             AS depreciation,
       round(sum(energy_cost) + sum(maintenance_cost) + sum(depreciation), 0) AS tco,
       round((sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0), 3) AS tco_per_km,
       round(1000 * sum(co2_kg) / nullif(sum(km), 0), 0) AS co2_g_per_km
FROM int_vehicle_month_economics
GROUP BY ALL
