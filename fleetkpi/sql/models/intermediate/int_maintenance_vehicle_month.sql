-- description: Fleet-paid maintenance cost and job count per vehicle-month (OEM / insurance work excluded from cost)
SELECT vehicle_id, date_trunc('month', opened_at)::DATE AS month_start,
       sum(total_cost) FILTER (WHERE paid_by = 'Fleet') AS maintenance_cost,
       count(*)                                          AS jobs
FROM stg_work_orders
GROUP BY ALL
