-- description: Duplicate site_id
-- table: sites
-- severity: error
SELECT site_id FROM sites GROUP BY 1 HAVING count(*) > 1
