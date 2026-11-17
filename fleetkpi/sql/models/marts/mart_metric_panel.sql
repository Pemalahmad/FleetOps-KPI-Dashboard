-- description: Region x month panel behind the metric network: exact identities (north star = visit rate x hours per visit; hours per visit = workshop + pick-up + back to ops + still open) next to every KPI, unrounded
-- materialized: table
WITH jobs AS (
    -- the same job set and region as mart_fleet_monthly: jobs attributed to the month the key went in
    SELECT vm.region, vm.month_start, coalesce(iv.is_repeat_visit, FALSE) AS is_repeat_visit,
           coalesce(v.total_cost, 0) AS cost, coalesce(v.goodwill_amount, 0) AS goodwill,
           coalesce(v.off_road_h, date_diff('minute', v.key_in_ts, snapshot_ts()) / 60.0) AS h,
           CASE WHEN v.off_road_h IS NOT NULL THEN coalesce(v.workshop_h, 0) ELSE 0 END AS w,
           CASE WHEN v.off_road_h IS NOT NULL THEN coalesce(v.time_to_pickup_h, 0) ELSE 0 END AS p,
           -- back to operations = the rest of the fleet clock after key back (equals back_to_ops_h, test t18)
           CASE WHEN v.off_road_h IS NOT NULL
                THEN v.off_road_h - coalesce(v.workshop_h, 0) - coalesce(v.time_to_pickup_h, 0) ELSE 0 END AS b,
           CASE WHEN v.off_road_h IS NULL
                THEN date_diff('minute', v.key_in_ts, snapshot_ts()) / 60.0 ELSE 0 END AS o
    FROM stg_work_orders v
    LEFT JOIN int_visits iv USING (work_order_id)
    JOIN int_vehicle_months vm
      ON vm.vehicle_id = v.vehicle_id AND vm.month_start = date_trunc('month', v.key_in_ts)::DATE
),
j AS (
    SELECT region, month_start, count(*) AS jobs, sum(h) AS offroad_h,
           sum(w) AS w, sum(p) AS p, sum(b) AS b, sum(o) AS o,
           count(*) FILTER (WHERE is_repeat_visit) AS repeat_visits,
           sum(cost) AS service_spend, sum(goodwill) AS goodwill
    FROM jobs GROUP BY ALL
)
SELECT f.region, f.month_start, f.active_vehicles, f.vehicle_days,
       coalesce(j.jobs, 0)                                         AS jobs,
       coalesce(j.offroad_h, 0)                                    AS offroad_h,
       30.4375 * coalesce(j.offroad_h, 0) / f.vehicle_days         AS offroad_h_per_vehicle_month,
       30.4375 * coalesce(j.jobs, 0) / f.vehicle_days              AS visits_per_vehicle_month,
       30.4375 * coalesce(j.jobs - j.repeat_visits, 0) / f.vehicle_days AS first_visits_per_vehicle_month,
       j.repeat_visits / nullif(j.jobs, 0)                         AS repeat_share,
       j.offroad_h / nullif(j.jobs, 0)                             AS offroad_h_per_visit,
       j.w / nullif(j.jobs, 0)                                     AS workshop_h_per_visit,
       j.p / nullif(j.jobs, 0)                                     AS pickup_h_per_visit,
       j.b / nullif(j.jobs, 0)                                     AS back_to_ops_h_per_visit,
       j.o / nullif(j.jobs, 0)                                     AS open_h_per_visit,
       100 * (1 - coalesce(j.offroad_h, 0) / (24.0 * f.vehicle_days)) AS availability_exact_pct,
       j.service_spend / nullif(j.jobs, 0)                         AS spend_per_visit,
       30.4375 * coalesce(j.service_spend, 0) / f.vehicle_days     AS spend_per_vehicle_month,
       100 * j.goodwill / nullif(j.service_spend, 0)               AS goodwill_share_pct,
       k.* EXCLUDE (region, month_start, active_vehicles, availability_pct)
FROM mart_fleet_monthly f
LEFT JOIN j USING (region, month_start)
LEFT JOIN mart_region_month_kpis k USING (region, month_start)
