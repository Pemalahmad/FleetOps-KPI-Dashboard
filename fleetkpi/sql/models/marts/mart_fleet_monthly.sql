-- description: Availability and utilisation by region and month
SELECT vm.region, vm.month_start,
       count(*)                                                                    AS active_vehicles,
       sum(vm.days_in_service)                                                     AS vehicle_days,
       sum(vm.km)                                                                  AS km,
       coalesce(sum(d.jobs_opened), 0)                                             AS jobs_opened,
       round(coalesce(sum(d.downtime_h), 0), 0)                                    AS downtime_h,
       round(100 * (1 - coalesce(sum(d.downtime_h), 0) / (sum(vm.days_in_service) * 24.0)), 2) AS availability_pct,
       round(100 * sum(vm.operating_hours)
             / nullif(sum(vm.days_in_service) FILTER (WHERE vm.operating_hours IS NOT NULL)
                      * cfg_num('planned_hours_per_day'), 0), 1)                   AS utilization_pct
FROM int_vehicle_months vm
LEFT JOIN int_downtime_monthly d USING (vehicle_id, month_start)
GROUP BY ALL
