-- Shared conventions for every model.
-- The snapshot is the moment the dashboard "runs": all open/closed logic is relative to it.
CREATE OR REPLACE MACRO snapshot_ts() AS TIMESTAMP '2026-10-01 00:00:00';

-- Targets used for RAG status. One place to change them.
CREATE OR REPLACE TABLE kpi_targets AS
SELECT * FROM (VALUES
    ('availability_pct',    98.5, 98.0, 'higher'),   -- green >= 98.5, amber >= 98.0, else red
    ('utilization_pct',     70.0, 65.0, 'higher'),
    ('turnaround_p50_h',    24.0, 30.0, 'lower'),    -- green <= 24h, amber <= 30h, else red
    ('first_time_fix_pct',  93.0, 90.0, 'higher'),
    ('cost_vs_budget_pct',   0.0,  5.0, 'lower'),    -- variance: green <= 0%, amber <= +5%
    ('recall_completion_pct', 85.0, 70.0, 'higher')
) t(kpi, green_threshold, amber_threshold, direction);

CREATE OR REPLACE MACRO rag(kpi_name, val) AS (
    SELECT CASE
        WHEN val IS NULL THEN 'n/a'
        WHEN direction = 'higher' AND val >= green_threshold THEN 'green'
        WHEN direction = 'higher' AND val >= amber_threshold THEN 'amber'
        WHEN direction = 'lower'  AND val <= green_threshold THEN 'green'
        WHEN direction = 'lower'  AND val <= amber_threshold THEN 'amber'
        ELSE 'red' END
    FROM kpi_targets WHERE kpi = kpi_name
);
