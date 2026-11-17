-- description: Every rating used in KPIs is 1-5 stars
-- severity: error
SELECT feedback_id FROM stg_feedback WHERE rating NOT BETWEEN 1 AND 5
