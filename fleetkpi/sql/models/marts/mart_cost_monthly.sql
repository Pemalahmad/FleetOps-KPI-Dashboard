-- description: Fleet-paid maintenance vs budget by region and month (budgets file, else fleet.yml rate x vehicle-months)
WITH vmon AS (
    SELECT region, month_start, sum(days_in_service / 30.0) AS vehicle_months
    FROM int_vehicle_months GROUP BY ALL
),
budget AS (
    SELECT v.region, v.month_start, v.vehicle_months,
           coalesce(b.budget,
                    v.vehicle_months * coalesce((SELECT per_vehicle_month FROM cfg_budget_rates WHERE region = v.region),
                                                (SELECT per_vehicle_month FROM cfg_budget_rates WHERE region = '*'))) AS budget
    FROM vmon v
    LEFT JOIN budgets b ON b.region = v.region AND date_trunc('month', b.month)::DATE = v.month_start
),
actual AS (
    SELECT vehicle_region AS region, date_trunc('month', opened_at)::DATE AS month_start,
           sum(total_cost) FILTER (WHERE paid_by = 'Fleet')  AS fleet_cost,
           sum(total_cost) FILTER (WHERE paid_by <> 'Fleet') AS other_paid_cost
    FROM stg_work_orders GROUP BY ALL
)
SELECT b.region, b.month_start,
       round(b.budget, 0)                                                      AS budget,
       round(coalesce(a.fleet_cost, 0), 0)                                     AS fleet_cost,
       round(coalesce(a.other_paid_cost, 0), 0)                                AS other_paid_cost,
       round(100.0 * (coalesce(a.fleet_cost, 0) / nullif(b.budget, 0) - 1), 1) AS cost_vs_budget_pct,
       round(coalesce(a.fleet_cost, 0) / nullif(b.vehicle_months, 0), 2)       AS fleet_cost_per_vehicle_month
FROM budget b
LEFT JOIN actual a USING (region, month_start)
