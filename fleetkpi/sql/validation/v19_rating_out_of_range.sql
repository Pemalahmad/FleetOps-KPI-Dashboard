-- description: Rating outside 1-5 stars
-- table: feedback
-- severity: error
SELECT coalesce(feedback_id, work_order_id, '?') || ' = ' || coalesce(rating::VARCHAR, 'blank')
FROM feedback WHERE rating IS NULL OR rating NOT BETWEEN 1 AND 5
