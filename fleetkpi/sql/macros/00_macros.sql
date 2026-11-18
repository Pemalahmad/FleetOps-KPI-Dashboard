-- Macros shared by every model. All settings come from fleet.yml via cfg_* tables.

CREATE OR REPLACE MACRO cfg_text(k) AS (SELECT value FROM cfg_settings WHERE key = k);
CREATE OR REPLACE MACRO cfg_num(k)  AS (SELECT value::DOUBLE FROM cfg_settings WHERE key = k);
CREATE OR REPLACE MACRO snapshot_ts()   AS (SELECT value::TIMESTAMP FROM cfg_settings WHERE key = 'snapshot_ts');
CREATE OR REPLACE MACRO snapshot_date() AS (SELECT value::TIMESTAMP::DATE FROM cfg_settings WHERE key = 'snapshot_ts');
-- Last complete month before the snapshot: what monthly scorecards report on.
CREATE OR REPLACE MACRO report_month() AS (date_trunc('month', snapshot_ts() - INTERVAL 1 DAY)::DATE);

-- RAG status against fleet.yml targets; 'n/a' when there is no value or no target.
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

-- Book value after `age_months` in service.
-- straight_line: linear to the residual value over the useful life.
-- declining_balance: constant annual rate that reaches the residual at end of life.
CREATE OR REPLACE MACRO book_value(cost, age_months) AS CASE
    WHEN cost IS NULL THEN NULL
    WHEN cfg_text('depreciation_method') = 'declining_balance' THEN
        cost * pow(cfg_num('residual_value_pct') / 100.0,
                   least(greatest(age_months, 0) / (cfg_num('useful_life_years') * 12.0), 1))
    ELSE
        cost - cost * (1 - cfg_num('residual_value_pct') / 100.0)
                    * least(greatest(age_months, 0) / (cfg_num('useful_life_years') * 12.0), 1)
END;

-- Registration / insurance document status at the snapshot.
CREATE OR REPLACE MACRO doc_status(expiry) AS CASE
    WHEN expiry IS NULL THEN 'Unknown'
    WHEN expiry < snapshot_date() THEN 'Expired'
    WHEN expiry <= snapshot_date() + to_days(CAST(cfg_num('expiring_window_days') AS INTEGER)) THEN 'Expiring'
    ELSE 'Valid'
END;

-- Licence classes: a held class covers a required one (CE covers C and B; C and D cover B). Free text is normalised.
CREATE OR REPLACE MACRO licence_norm(c) AS CASE
    WHEN c IS NULL OR trim(c) = '' THEN NULL
    WHEN regexp_matches(lower(c), '^c\s*e$|^ce$|artic|trailer|semi') THEN 'CE'
    WHEN regexp_matches(lower(c), '^c1?$|heavy|truck|lorry') THEN 'C'
    WHEN regexp_matches(lower(c), '^d1?e?$|bus|coach') THEN 'D'
    WHEN regexp_matches(lower(c), '^a\d?$|motor ?cycle|bike') THEN 'A'
    WHEN regexp_matches(lower(c), '^b\s*e?$|light|car|private') THEN 'B'
    ELSE upper(trim(c)) END;
CREATE OR REPLACE MACRO required_licence(make, model) AS CASE
    WHEN regexp_matches(lower(coalesce(make, '') || ' ' || coalesce(model, '')),
         'tractor|prime mover|semi|head truck|volvo fh|fh16|scania [rsg]|tgx|daf xf|cascadia|t680|actros 1[89]|actros 2') THEN 'CE'
    WHEN regexp_matches(lower(coalesce(make, '') || ' ' || coalesce(model, '')),
         'truck|lorry|canter|npr|nqr|\belf\b|dyna|atego|fuso|tipper|hino') THEN 'C'
    WHEN regexp_matches(lower(coalesce(make, '') || ' ' || coalesce(model, '')), '\bbus\b|coaster|rosa|civilian|minibus') THEN 'D'
    ELSE 'B' END;
CREATE OR REPLACE MACRO licence_covers(held, req) AS CASE
    WHEN held IS NULL OR req IS NULL THEN NULL
    WHEN req = 'B' THEN held IN ('B', 'C', 'CE', 'D')
    WHEN req = 'C' THEN held IN ('C', 'CE')
    WHEN req = 'CE' THEN held = 'CE'
    WHEN req = 'D' THEN held = 'D'
    ELSE held = req END;
