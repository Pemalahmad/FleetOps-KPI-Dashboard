-- description: Vehicles affected by each recall campaign, with launch date and region
SELECT rv.campaign_id, r.title, r.launch_date, rv.vehicle_id, v.region
FROM recall_vehicles rv
JOIN recalls r USING (campaign_id)
JOIN vehicles v USING (vehicle_id)
