-- description: Work order at a site not in sites
-- table: work_orders
-- needs: work_orders, sites
-- severity: error
SELECT w.work_order_id || ' -> ' || w.site_id
FROM work_orders w LEFT JOIN sites s USING (site_id)
WHERE s.site_id IS NULL
