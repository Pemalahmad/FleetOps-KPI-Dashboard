-- description: Fuel and charging rows, priced (actual or fleet.yml) and converted to CO2
SELECT
    e.vehicle_id, e.date, date_trunc('month', e.date)::DATE AS month_start,
    e.energy_type, e.quantity, e.duration_minutes, v.powertrain, v.region,
    coalesce(e.cost, e.quantity * CASE WHEN e.energy_type = 'electricity'
                                       THEN elec_price(v.region) ELSE fuel_price(v.region) END) AS cost,
    e.quantity * CASE WHEN e.energy_type = 'electricity' THEN grid_co2(v.region)
        ELSE coalesce((SELECT kg_per_litre FROM cfg_fuel_co2 WHERE fuel_type = coalesce(v.fuel_type, 'petrol')),
                      (SELECT kg_per_litre FROM cfg_fuel_co2 WHERE fuel_type = 'petrol')) END AS co2_kg
FROM energy e
JOIN vehicles v USING (vehicle_id)
