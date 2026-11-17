-- Fleet availability and utilisation.
-- availability = 1 - workshop vehicle-hours / vehicle-hours in service (24h basis)
-- utilisation  = operating hours / (days in service x planned operating hours per day)
-- Workshop time counts in the month the job opened; open jobs count hours elapsed so far.

CREATE OR REPLACE VIEW downtime_monthly AS
SELECT vehicle_id, date_trunc('month', opened_at)::DATE AS month_start,
       sum(coalesce(turnaround_h, date_diff('minute', opened_at, snapshot_ts()) / 60.0)) AS downtime_h,
       count(*) AS jobs_opened
FROM wo GROUP BY ALL;

CREATE OR REPLACE VIEW fleet_monthly AS
SELECT vm.region, vm.month_start,
       count(*)                                                        AS active_vehicles,
       sum(vm.days_in_service)                                         AS vehicle_days,
       sum(vm.km)                                                      AS km,
       coalesce(sum(d.jobs_opened), 0)                                 AS jobs_opened,
       round(coalesce(sum(d.downtime_h), 0), 0)                        AS downtime_h,
       round(100 * (1 - coalesce(sum(d.downtime_h), 0) / (sum(vm.days_in_service) * 24.0)), 2) AS availability_pct,
       round(100 * sum(vm.operating_hours)
             / nullif(sum(vm.days_in_service) FILTER (WHERE vm.operating_hours IS NOT NULL)
                      * cfg_num('planned_hours_per_day'), 0), 1)       AS utilization_pct
FROM vehicle_months vm
LEFT JOIN downtime_monthly d USING (vehicle_id, month_start)
GROUP BY ALL;

CREATE OR REPLACE VIEW fleet_monthly_powertrain AS
SELECT vm.powertrain, vm.month_start,
       count(*)                                                        AS active_vehicles,
       round(100 * (1 - coalesce(sum(d.downtime_h), 0) / (sum(vm.days_in_service) * 24.0)), 2) AS availability_pct,
       round(1000.0 * coalesce(sum(d.jobs_opened), 0) / nullif(sum(vm.km), 0) * 10, 2)        AS jobs_per_10k_km
FROM vehicle_months vm
LEFT JOIN downtime_monthly d USING (vehicle_id, month_start)
GROUP BY ALL;
