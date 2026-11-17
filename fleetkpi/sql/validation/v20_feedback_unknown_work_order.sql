-- description: Feedback for a work order not in work_orders
-- table: feedback
-- needs: feedback, work_orders
-- severity: warning
SELECT f.work_order_id FROM feedback f LEFT JOIN work_orders w USING (work_order_id)
WHERE f.work_order_id IS NOT NULL AND w.work_order_id IS NULL
