-- description: Duplicate fine_id
-- table: fines
-- severity: error
SELECT fine_id FROM fines GROUP BY 1 HAVING count(*) > 1
