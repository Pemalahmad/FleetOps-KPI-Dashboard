-- Fleet-paid service cost vs budget, by market and month.
-- Budget = vehicle-months in service x the market's budget per vehicle-month.
-- Warranty and recall work is OEM-paid and excluded from fleet cost.
CREATE OR REPLACE VIEW cost_monthly AS
WITH budget AS (
    SELECT vm.market_id, vm.month_start,
           sum(vm.days_in_service / 30.0) * any_value(m.budget_per_vehicle_month_usd) AS budget_usd,
           sum(vm.days_in_service / 30.0)                                            AS vehicle_months
    FROM vehicle_months vm JOIN markets m USING (market_id)
    GROUP BY ALL
),
actual AS (
    SELECT market_id, date_trunc('month', opened_at)::DATE AS month_start,
           sum(cost_usd) FILTER (WHERE paid_by = 'Fleet') AS fleet_cost_usd,
           sum(cost_usd) FILTER (WHERE paid_by = 'OEM')   AS oem_cost_usd
    FROM service_jobs
    GROUP BY ALL
)
SELECT
    m.market, b.market_id, b.month_start,
    round(b.budget_usd, 0)                                              AS budget_usd,
    round(coalesce(a.fleet_cost_usd, 0), 0)                             AS fleet_cost_usd,
    round(coalesce(a.oem_cost_usd, 0), 0)                               AS oem_cost_usd,
    round(100.0 * (coalesce(a.fleet_cost_usd, 0) / b.budget_usd - 1), 1) AS cost_vs_budget_pct,
    round(coalesce(a.fleet_cost_usd, 0) / b.vehicle_months, 2)           AS fleet_cost_per_vehicle_month_usd
FROM budget b
JOIN markets m USING (market_id)
LEFT JOIN actual a USING (market_id, month_start);
