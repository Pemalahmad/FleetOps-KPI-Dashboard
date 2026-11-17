-- description: Amount paid on each vehicle for services: visits, total spend by payer, goodwill and spend per 1,000 km
WITH km AS (SELECT vehicle_id, sum(km) AS km FROM int_vehicle_months GROUP BY ALL)
SELECT v.vehicle_id, v.region, v.powertrain, v.model, v.days_in_service,
       count(w.work_order_id)                                         AS visits,
       round(coalesce(sum(w.total_cost), 0), 0)                       AS total_service_spend,
       round(coalesce(sum(w.total_cost) FILTER (WHERE w.paid_by = 'Fleet'), 0), 0) AS fleet_paid,
       round(coalesce(sum(w.total_cost) FILTER (WHERE w.paid_by <> 'Fleet'), 0), 0) AS other_paid,
       round(coalesce(sum(w.goodwill_amount), 0), 0)                  AS goodwill,
       round(1000.0 * coalesce(sum(w.total_cost), 0) / nullif(any_value(k.km), 0), 2) AS spend_per_1000_km
FROM stg_vehicles v
LEFT JOIN stg_work_orders w USING (vehicle_id)
LEFT JOIN km k USING (vehicle_id)
WHERE v.is_active
GROUP BY ALL
