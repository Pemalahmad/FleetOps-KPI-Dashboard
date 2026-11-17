-- description: Document expires before it was issued
-- table: documents
-- severity: error
SELECT document_id FROM documents WHERE expiry_date < issue_date
