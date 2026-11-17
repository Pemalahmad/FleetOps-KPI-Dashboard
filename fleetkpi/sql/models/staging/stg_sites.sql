-- description: Sites with productive technician hours per day
SELECT
    site_id, site_name, region, site_type, technicians, open_date,
    technicians * cfg_num('productive_hours_per_day') AS productive_hours_per_day
FROM sites
