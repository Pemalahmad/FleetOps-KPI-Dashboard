-- description: Opened before the site opened
-- table: work_orders
-- needs: work_orders, sites
-- severity: warning
SELECT w.work_order_id FROM work_orders w JOIN sites s USING (site_id)
WHERE s.open_date IS NOT NULL AND w.opened_at::DATE < s.open_date
