-- description: Fleet-paid cost in the cost mart reconciles to the work orders for every region-month (within rounding)
-- severity: error
WITH src AS (
    SELECT vehicle_region AS region, date_trunc('month', opened_at)::DATE AS month_start, sum(total_cost) AS cost
    FROM stg_work_orders WHERE paid_by = 'Fleet' GROUP BY ALL
)
SELECT m.region, m.month_start, m.fleet_cost, s.cost
FROM mart_cost_monthly m
LEFT JOIN src s USING (region, month_start)
WHERE abs(m.fleet_cost - coalesce(s.cost, 0)) > 0.5
