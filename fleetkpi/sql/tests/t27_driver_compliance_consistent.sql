-- description: Every driver has a known compliance status, and fines attributed to drivers never exceed the fines on file
-- severity: error
SELECT driver_id FROM mart_driver_compliance WHERE compliance_status NOT IN ('Compliant', 'Action needed', 'Not compliant')
UNION ALL
SELECT 'fines' FROM (SELECT sum(fines) AS n FROM mart_driver_compliance) WHERE n > (SELECT count(*) FROM stg_fines)
