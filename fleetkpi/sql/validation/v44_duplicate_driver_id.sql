-- description: The same driver id appears more than once
-- table: drivers
-- needs: drivers
-- severity: error
SELECT driver_id FROM drivers GROUP BY driver_id HAVING count(*) > 1
