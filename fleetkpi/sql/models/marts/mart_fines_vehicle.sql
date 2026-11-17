-- description: Fines per vehicle, all time in the data: the repeat offenders and the unpaid balance
SELECT f.vehicle_id, f.region, v.powertrain, v.use_case,
       count(*)                                          AS fines,
       round(sum(f.amount), 0)                           AS amount,
       round(sum(f.amount) FILTER (WHERE f.is_unpaid), 0) AS unpaid_amount,
       list_distinct(list(f.fine_type))                  AS fine_types,
       max(f.date)                                       AS last_fine
FROM stg_fines f
JOIN stg_vehicles v USING (vehicle_id)
GROUP BY ALL
ORDER BY fines DESC, amount DESC
