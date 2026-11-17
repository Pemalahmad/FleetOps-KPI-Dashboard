-- description: Fleet acquisition cost, book value and depreciation by month and powertrain
SELECT month_start, powertrain,
       count(*)                                           AS vehicles,
       round(sum(purchase_cost), 0)                       AS acquisition_cost,
       round(sum(book_value_end), 0)                      AS book_value,
       round(sum(book_value_start - book_value_end), 0)   AS depreciation,
       round(100.0 * sum(book_value_end) / nullif(sum(purchase_cost), 0), 1) AS value_retained_pct
FROM int_vehicle_months
WHERE purchase_cost IS NOT NULL
GROUP BY ALL
