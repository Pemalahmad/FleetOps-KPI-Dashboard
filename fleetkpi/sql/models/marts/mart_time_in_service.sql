-- description: Active fleet by time in service (age band) and powertrain
SELECT powertrain,
       CASE WHEN days_in_service < 180 THEN '0-6 months' WHEN days_in_service < 365 THEN '6-12 months'
            WHEN days_in_service < 730 THEN '1-2 years' WHEN days_in_service < 1095 THEN '2-3 years'
            ELSE '3+ years' END                                                   AS age_band,
       CASE WHEN days_in_service < 180 THEN 1 WHEN days_in_service < 365 THEN 2
            WHEN days_in_service < 730 THEN 3 WHEN days_in_service < 1095 THEN 4 ELSE 5 END AS band_order,
       count(*)                                                                   AS vehicles,
       round(avg(days_in_service), 0)                                             AS avg_days_in_service
FROM stg_vehicles
WHERE is_active
GROUP BY ALL
