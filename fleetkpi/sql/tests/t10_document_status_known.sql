-- description: Registration and insurance statuses are one of Valid, Expiring, Expired, Unknown
-- severity: error
SELECT document, status FROM mart_compliance_status WHERE status NOT IN ('Valid', 'Expiring', 'Expired', 'Unknown')
