-- description: Recall campaign not in recalls
-- table: recall_vehicles
-- needs: recall_vehicles, recalls
-- severity: warning
SELECT DISTINCT r.campaign_id FROM recall_vehicles r LEFT JOIN recalls c USING (campaign_id) WHERE c.campaign_id IS NULL
