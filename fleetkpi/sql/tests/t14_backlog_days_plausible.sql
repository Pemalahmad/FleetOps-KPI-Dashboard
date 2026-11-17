-- description: More than 10 days of backlog suggests open jobs that were never closed in the source system
-- severity: warn
SELECT site_name FROM mart_backlog WHERE backlog_days > 10
