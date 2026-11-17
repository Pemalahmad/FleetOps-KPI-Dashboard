-- description: Fine amounts in the monthly mart reconcile to the fines register
-- severity: error
SELECT 1 WHERE abs(coalesce((SELECT sum(amount) FROM mart_fines_monthly), 0)
                 - coalesce((SELECT sum(amount) FROM stg_fines), 0))
           > (SELECT count(*) FROM mart_fines_monthly) * 0.5 + 0.5
