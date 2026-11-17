-- Recall completion (the evidence a regulator asks for) and maintenance cost vs budget.

CREATE OR REPLACE VIEW recall_completion AS
SELECT r.campaign_id, r.title, v.region,
       count(DISTINCT rv.vehicle_id)                                         AS affected_vehicles,
       count(DISTINCT w.vehicle_id) FILTER (WHERE w.closed_at IS NOT NULL)   AS completed_vehicles,
       round(100.0 * count(DISTINCT w.vehicle_id) FILTER (WHERE w.closed_at IS NOT NULL)
             / count(DISTINCT rv.vehicle_id), 1)                             AS completion_pct,
       round(median(date_diff('day', r.launch_date, w.closed_at::DATE)), 0)  AS median_days_to_fix,
       date_diff('day', r.launch_date, snapshot_ts()::DATE)                  AS days_since_launch
FROM recalls r
JOIN recall_vehicles rv USING (campaign_id)
JOIN vehicles v ON v.vehicle_id = rv.vehicle_id
LEFT JOIN work_orders w ON w.campaign_id = rv.campaign_id AND w.vehicle_id = rv.vehicle_id
GROUP BY ALL
ORDER BY r.campaign_id, completion_pct;

CREATE OR REPLACE VIEW recall_curve AS
WITH weeks AS (
    SELECT campaign_id, launch_date,
           unnest(generate_series(0, date_diff('week', launch_date, snapshot_ts()::DATE))) AS week_no
    FROM recalls
),
affected AS (
    SELECT rv.campaign_id, v.region, count(*) AS n
    FROM recall_vehicles rv JOIN vehicles v USING (vehicle_id) GROUP BY ALL
),
fixed AS (
    SELECT w.campaign_id, v.region, date_diff('week', r.launch_date, w.closed_at::DATE) AS week_fixed
    FROM work_orders w JOIN recalls r USING (campaign_id) JOIN vehicles v USING (vehicle_id)
    WHERE w.closed_at IS NOT NULL
)
SELECT w.campaign_id, a.region, w.week_no,
       round(100.0 * (SELECT count(*) FROM fixed f
                      WHERE f.campaign_id = w.campaign_id AND f.region = a.region AND f.week_fixed <= w.week_no)
             / a.n, 1) AS cumulative_completion_pct
FROM weeks w JOIN affected a USING (campaign_id);

-- Budget: the budgets file when supplied for a region-month, else fleet.yml rate x vehicle-months.
CREATE OR REPLACE VIEW cost_monthly AS
WITH vmon AS (
    SELECT region, month_start, sum(days_in_service / 30.0) AS vehicle_months
    FROM vehicle_months GROUP BY ALL
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
           sum(total_cost) FILTER (WHERE paid_by = 'Fleet') AS fleet_cost,
           sum(total_cost) FILTER (WHERE paid_by <> 'Fleet') AS other_paid_cost
    FROM wo GROUP BY ALL
)
SELECT b.region, b.month_start,
       round(b.budget, 0)                                                AS budget,
       round(coalesce(a.fleet_cost, 0), 0)                               AS fleet_cost,
       round(coalesce(a.other_paid_cost, 0), 0)                          AS other_paid_cost,
       round(100.0 * (coalesce(a.fleet_cost, 0) / nullif(b.budget, 0) - 1), 1) AS cost_vs_budget_pct,
       round(coalesce(a.fleet_cost, 0) / nullif(b.vehicle_months, 0), 2) AS fleet_cost_per_vehicle_month
FROM budget b
LEFT JOIN actual a USING (region, month_start);
