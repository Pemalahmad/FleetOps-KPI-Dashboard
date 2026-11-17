-- description: Parts lead times are never negative and on-time is only judged for arrived parts
-- severity: error
SELECT part_order_id FROM stg_parts_orders
WHERE actual_lead_days < 0 OR (arrived_at IS NULL AND on_time IS NOT NULL)
