-- description: Customer satisfaction by region and month: responses, average stars, CSAT (4-5 stars), 1-2 star share
SELECT region, month_start,
       count(*)                                      AS responses,
       round(avg(rating), 2)                         AS avg_rating,
       round(100.0 * avg(is_satisfied::INT), 1)      AS csat_pct,
       count(*) FILTER (WHERE is_low)                AS low_ratings,
       round(100.0 * avg(is_low::INT), 1)            AS low_rating_pct
FROM stg_feedback
WHERE region IS NOT NULL
GROUP BY ALL
