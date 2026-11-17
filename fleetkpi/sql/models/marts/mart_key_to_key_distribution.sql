-- description: Key-to-key time histogram by job type, KPI window
SELECT job_type,
       CASE WHEN key_to_key_h < 8 THEN '< 8h' WHEN key_to_key_h < 24 THEN '8-24h'
            WHEN key_to_key_h < 48 THEN '1-2 days' WHEN key_to_key_h < 96 THEN '2-4 days'
            ELSE '4+ days' END                                    AS bucket,
       CASE WHEN key_to_key_h < 8 THEN 1 WHEN key_to_key_h < 24 THEN 2
            WHEN key_to_key_h < 48 THEN 3 WHEN key_to_key_h < 96 THEN 4 ELSE 5 END AS bucket_order,
       count(*) AS jobs
FROM stg_work_orders
WHERE job_type <> 'Recall' AND key_out_ts IS NOT NULL AND key_out_ts < snapshot_ts()
  AND key_out_ts::DATE > report_month() - to_months(CAST(cfg_num('kpi_window_months') AS INTEGER))
GROUP BY ALL
