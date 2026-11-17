-- description: Ready for pick-up before the job was opened
-- table: work_orders
-- severity: error
SELECT work_order_id FROM work_orders WHERE ready_at < opened_at
