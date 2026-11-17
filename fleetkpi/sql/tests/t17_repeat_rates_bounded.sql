-- description: Repeat counts never exceed the visits and repairs they come from
-- severity: error
SELECT region, month_start FROM mart_repeat_monthly
WHERE repeat_visits > visits OR repeat_repairs > repairs
