-- description: Feedback with no work order, vehicle or site (cannot be attributed)
-- table: feedback
-- severity: warning
SELECT coalesce(feedback_id, '?') FROM feedback
WHERE work_order_id IS NULL AND vehicle_id IS NULL AND site_id IS NULL
