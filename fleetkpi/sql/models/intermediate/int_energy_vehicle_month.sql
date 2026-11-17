-- description: Litres, kWh, energy cost, CO2 and fuelling / charging time per vehicle-month
SELECT vehicle_id, month_start,
       sum(quantity) FILTER (WHERE energy_type = 'fuel')        AS fuel_l,
       sum(quantity) FILTER (WHERE energy_type = 'electricity') AS kwh,
       sum(cost)                                                AS energy_cost,
       sum(co2_kg)                                              AS co2_kg,
       sum(duration_minutes) / 60.0                             AS energy_downtime_h
FROM stg_energy
GROUP BY ALL
