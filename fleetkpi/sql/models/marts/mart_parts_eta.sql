-- description: Parts ETA reliability by supplier and month of arrival: orders, on-time %, average days late, lead time
SELECT supplier, date_trunc('month', arrived_at)::DATE AS month_start,
       count(*)                                              AS orders_arrived,
       round(100.0 * avg(on_time::INT), 1)                   AS on_time_pct,
       round(avg(days_late) FILTER (WHERE NOT on_time), 1)   AS avg_days_late_when_late,
       round(median(promised_lead_days), 1)                  AS promised_lead_days_p50,
       round(median(actual_lead_days), 1)                    AS actual_lead_days_p50
FROM stg_parts_orders
WHERE arrived_at IS NOT NULL
GROUP BY ALL
