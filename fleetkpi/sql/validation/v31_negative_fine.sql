-- description: Negative fine amount
-- table: fines
-- severity: warning
SELECT fine_id FROM fines WHERE amount < 0
