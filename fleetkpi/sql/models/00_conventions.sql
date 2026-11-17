-- Conventions shared by every model. Settings come from fleet.yml via cfg_* tables.

CREATE OR REPLACE MACRO cfg_text(k) AS (SELECT value FROM cfg_settings WHERE key = k);
CREATE OR REPLACE MACRO cfg_num(k)  AS (SELECT value::DOUBLE FROM cfg_settings WHERE key = k);
CREATE OR REPLACE MACRO snapshot_ts() AS (SELECT value::TIMESTAMP FROM cfg_settings WHERE key = 'snapshot_ts');
-- Last complete month before the snapshot: what monthly scorecards report on.
CREATE OR REPLACE MACRO report_month() AS (date_trunc('month', snapshot_ts() - INTERVAL 1 DAY)::DATE);

-- RAG status against fleet.yml targets. 'n/a' when there is no value or no target.
CREATE OR REPLACE MACRO rag(kpi_name, val) AS coalesce((
    SELECT CASE
        WHEN val IS NULL THEN 'n/a'
        WHEN direction = 'higher' AND val >= green THEN 'green'
        WHEN direction = 'higher' AND val >= amber THEN 'amber'
        WHEN direction = 'lower'  AND val <= green THEN 'green'
        WHEN direction = 'lower'  AND val <= amber THEN 'amber'
        ELSE 'red' END
    FROM cfg_targets WHERE kpi = kpi_name), 'n/a');

-- Region-aware lookups with a '*' default row.
CREATE OR REPLACE MACRO fuel_price(r) AS coalesce(
    (SELECT fuel_per_litre FROM cfg_prices WHERE region = r),
    (SELECT fuel_per_litre FROM cfg_prices WHERE region = '*'));
CREATE OR REPLACE MACRO elec_price(r) AS coalesce(
    (SELECT electricity_per_kwh FROM cfg_prices WHERE region = r),
    (SELECT electricity_per_kwh FROM cfg_prices WHERE region = '*'));
CREATE OR REPLACE MACRO grid_co2(r) AS coalesce(
    (SELECT kg_per_kwh FROM cfg_grid_co2 WHERE region = r),
    (SELECT kg_per_kwh FROM cfg_grid_co2 WHERE region = '*'));
