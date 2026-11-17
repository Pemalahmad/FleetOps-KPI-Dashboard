-- description: Duplicate document_id
-- table: documents
-- severity: error
SELECT document_id FROM documents GROUP BY 1 HAVING count(*) > 1
