-- description: No negative turnaround or key-to-key time
-- severity: error
SELECT work_order_id FROM stg_work_orders WHERE turnaround_h < 0 OR key_to_key_h < 0
