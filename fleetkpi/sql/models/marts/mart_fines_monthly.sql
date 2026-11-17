-- description: Fines registered by region, month and type: count, amount and unpaid amount
SELECT region, month_start, fine_type,
       count(*)                                            AS fines,
       round(sum(amount), 0)                               AS amount,
       round(sum(amount) FILTER (WHERE is_unpaid), 0)      AS unpaid_amount
FROM stg_fines
GROUP BY ALL
