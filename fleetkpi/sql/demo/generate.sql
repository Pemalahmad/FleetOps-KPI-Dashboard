-- =====================================================================
-- Demo data generator: "Sahra Mobility", a FICTIONAL mixed fleet
-- (battery-electric, plug-in hybrid, hybrid and combustion) across the GCC
-- and Türkiye. Output: the canonical contract tables, exported to CSV and
-- loaded back through the normal ingest path, exactly like a customer's files.
--
-- Everything is invented. Randomness is hash-based, so builds are identical.
-- Window: 2025-04-01 to 2026-09-30.
--
-- Stories the KPIs must catch:
--   1. Riyadh North (WS04): parts shortage + attrition, Mar-Jun 2026; recovery Jul 2026.
--   2. Istanbul Asia (WS12): underperforms until a turnaround in Oct 2025.
-- =====================================================================

CREATE OR REPLACE MACRO rnd(k) AS (hash(k) % 1000000)::DOUBLE / 1000000.0;

CREATE OR REPLACE TEMP TABLE d_regions AS
SELECT * FROM (VALUES
    -- region,   launch,            fleet, budget/veh-month
    ('UAE',     DATE '2024-01-01', 1800, 250.0),
    ('KSA',     DATE '2025-07-01', 1500, 240.0),
    ('Qatar',   DATE '2024-06-01',  500, 255.0),
    ('Kuwait',  DATE '2024-09-01',  400, 245.0),
    ('Bahrain', DATE '2025-01-01',  250, 255.0),
    ('Oman',    DATE '2025-03-01',  250, 240.0),
    ('Türkiye', DATE '2024-03-01', 1800, 245.0)
) t(region, launch_date, target_fleet, budget_pvm);

-- Prices used to cost energy rows (USD). Illustrative, not market quotes.
CREATE OR REPLACE TEMP TABLE d_prices AS
SELECT * FROM (VALUES
    ('UAE', 0.78, 0.12), ('KSA', 0.62, 0.07), ('Qatar', 0.55, 0.09), ('Kuwait', 0.34, 0.05),
    ('Bahrain', 0.53, 0.08), ('Oman', 0.60, 0.09), ('Türkiye', 1.30, 0.18)
) t(region, fuel_usd_l, elec_usd_kwh);

CREATE OR REPLACE TABLE sites AS
SELECT * FROM (VALUES
    ('WS01', 'Dubai Al Quoz',         'UAE',     'workshop', 14, DATE '2024-01-01'),
    ('WS02', 'Dubai JAFZA',           'UAE',     'workshop', 10, DATE '2024-06-01'),
    ('WS03', 'Abu Dhabi Mussafah',    'UAE',     'workshop', 10, DATE '2024-03-01'),
    ('WS04', 'Riyadh North',          'KSA',     'workshop', 12, DATE '2025-07-01'),
    ('WS05', 'Riyadh South',          'KSA',     'workshop', 10, DATE '2025-07-01'),
    ('WS06', 'Jeddah',                'KSA',     'workshop',  8, DATE '2025-10-01'),
    ('WS07', 'Dammam',                'KSA',     'workshop',  6, DATE '2026-01-01'),
    ('WS08', 'Doha Industrial Area',  'Qatar',   'workshop',  9, DATE '2024-06-01'),
    ('WS09', 'Kuwait Shuwaikh',       'Kuwait',  'workshop',  8, DATE '2024-09-01'),
    ('WS10', 'Bahrain Sitra',         'Bahrain', 'workshop',  5, DATE '2025-01-01'),
    ('WS11', 'Muscat Ghala',          'Oman',    'workshop',  5, DATE '2025-03-01'),
    ('WS12', 'Istanbul Asia (Tuzla)', 'Türkiye', 'workshop', 12, DATE '2024-03-01'),
    ('WS13', 'Istanbul Europe',       'Türkiye', 'workshop', 12, DATE '2024-03-01'),
    ('WS14', 'Ankara',                'Türkiye', 'workshop',  8, DATE '2024-06-01'),
    ('WS15', 'Izmir',                 'Türkiye', 'workshop',  7, DATE '2024-09-01')
) t(site_id, site_name, region, site_type, technicians, open_date);

-- ------------------------------------------------------------------ vehicles
CREATE OR REPLACE TABLE vehicles AS
WITH base AS (
    SELECT region, launch_date, unnest(generate_series(1, target_fleet)) AS n FROM d_regions
),
ids AS (
    SELECT b.*, 'V' || lpad((SELECT count(*) FROM d_regions r2 WHERE r2.region <= b.region)::VARCHAR, 2, '0')
                     || lpad(n::VARCHAR, 5, '0') AS vehicle_id
    FROM base b
),
sl AS (SELECT region, list(site_id ORDER BY site_id) AS ids FROM sites GROUP BY region),
typed AS (
    SELECT i.*, sl.ids,
        CASE WHEN rnd(i.vehicle_id || 'pt') < 0.45 THEN 'BEV'
             WHEN rnd(i.vehicle_id || 'pt') < 0.55 THEN 'PHEV'
             WHEN rnd(i.vehicle_id || 'pt') < 0.80 THEN 'HEV'
             ELSE 'ICE' END AS powertrain,
        rnd(i.vehicle_id || 'use') < 0.12 AS is_delivery
    FROM ids i JOIN sl USING (region)
)
SELECT
    vehicle_id,
    powertrain,
    CASE WHEN powertrain = 'BEV' THEN NULL WHEN powertrain = 'ICE' AND is_delivery THEN 'diesel' ELSE 'petrol' END AS fuel_type,
    'Sahra' AS make,
    CASE powertrain
        WHEN 'BEV'  THEN CASE WHEN rnd(vehicle_id || 'm') < 0.6 THEN 'S1 Sedan EV' ELSE 'X2 SUV EV' END
        WHEN 'PHEV' THEN 'X2 SUV PHEV'
        WHEN 'HEV'  THEN 'S1 Sedan Hybrid'
        ELSE CASE WHEN is_delivery THEN 'V3 Van Diesel' ELSE 'S1 Sedan Petrol' END END AS model,
    ids[1 + CAST(floor(rnd(vehicle_id || 'hc') * len(ids)) AS INTEGER)] AS home_site_id,
    region,
    (launch_date + CAST(floor(pow(rnd(vehicle_id || 'isd'), 1.2)
        * date_diff('day', launch_date, DATE '2026-08-31')) AS INTEGER))::DATE AS in_service_date,
    CAST(NULL AS DATE) AS out_of_service_date,
    round(CASE powertrain WHEN 'BEV' THEN 42000 WHEN 'PHEV' THEN 38000 WHEN 'HEV' THEN 31000 ELSE 27000 END
          * (0.92 + 0.16 * rnd(vehicle_id || 'pc')), -2) AS purchase_cost,
    CASE WHEN is_delivery THEN 'Delivery' ELSE 'Ride-hail' END AS use_case
FROM typed;

-- ------------------------------------------------------ vehicle-months (helper)
CREATE OR REPLACE TEMP TABLE d_vm AS
WITH months AS (
    SELECT unnest(generate_series(DATE '2025-04-01', DATE '2026-09-01', INTERVAL 1 MONTH))::DATE AS month_start
)
SELECT v.vehicle_id, v.region, v.powertrain, v.fuel_type, v.use_case, v.home_site_id, v.in_service_date, m.month_start,
       date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1 AS days,
       round((date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1)
             * (140 + 120 * rnd(v.vehicle_id || m.month_start || 'km')), 0) AS km,
       round((date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1) * 16
             * (0.58 + 0.27 * rnd(v.vehicle_id || m.month_start || 'u'))
             * CASE WHEN v.region <> 'Türkiye' AND month(m.month_start) IN (6, 7, 8) THEN 0.88 ELSE 1.0 END
             * CASE WHEN v.use_case = 'Delivery' THEN 1.08 ELSE 1.0 END, 1) AS operating_hours
FROM vehicles v JOIN months m ON v.in_service_date <= last_day(m.month_start);

CREATE OR REPLACE TABLE usage AS
SELECT vehicle_id, month_start AS date, km, operating_hours FROM d_vm;

-- ------------------------------------------------------------------- energy
CREATE OR REPLACE TABLE energy AS
WITH e AS (
    SELECT d.*, p.fuel_usd_l, p.elec_usd_kwh,
        CASE WHEN d.region <> 'Türkiye' AND month(d.month_start) IN (6, 7, 8) THEN 1.08 ELSE 1.0 END AS heat
    FROM d_vm d JOIN d_prices p USING (region)
),
rows AS (
    -- electricity: BEV all km, PHEV ~55% of km
    SELECT vehicle_id, month_start, 'electricity' AS energy_type,
           km * CASE powertrain WHEN 'BEV' THEN (0.16 + 0.04 * rnd(vehicle_id || month_start || 'ke'))
                                ELSE 0.55 * 0.19 END * heat AS qty,
           elec_usd_kwh AS price,
           CASE powertrain WHEN 'BEV' THEN 60.0 ELSE 7.0 * 5 END AS kw  -- PHEV: slow AC, mostly off-shift
    FROM e WHERE powertrain IN ('BEV', 'PHEV')
    UNION ALL
    SELECT vehicle_id, month_start, 'fuel',
           km * CASE WHEN powertrain = 'PHEV' THEN 0.45 * 0.062
                     WHEN powertrain = 'HEV'  THEN 0.048 + 0.010 * rnd(vehicle_id || month_start || 'kf')
                     WHEN fuel_type = 'diesel' THEN 0.105 + 0.020 * rnd(vehicle_id || month_start || 'kf')
                     ELSE 0.085 + 0.020 * rnd(vehicle_id || month_start || 'kf') END * heat,
           fuel_usd_l, NULL
    FROM e WHERE powertrain IN ('PHEV', 'HEV', 'ICE')
)
SELECT vehicle_id, month_start AS date, energy_type,
       round(qty, 1) AS quantity,
       round(qty * price * (0.96 + 0.08 * rnd(vehicle_id || month_start || energy_type || 'c')), 2) AS cost,
       round(CASE WHEN energy_type = 'fuel' THEN qty / 45.0 * 7 ELSE qty / kw * 60 END, 0) AS duration_minutes
FROM rows;

-- ----------------------------------------------- preventive maintenance jobs
-- One job each time cumulative km crosses the powertrain interval; ~3% are skipped
-- (20% at Riyadh North during the crisis), which is what PM compliance must catch.
CREATE OR REPLACE TEMP TABLE d_pm AS
WITH c AS (
    SELECT d.*,
           sum(km) OVER (PARTITION BY vehicle_id ORDER BY month_start) AS cum_km,
           CASE powertrain WHEN 'ICE' THEN 10000 WHEN 'BEV' THEN 25000 ELSE 15000 END AS ivl
    FROM d_vm d
)
SELECT *, CAST(floor(cum_km / ivl) - floor((cum_km - km) / ivl) AS INTEGER) AS pm_due
FROM c;

-- ------------------------------------------------------------- work orders
CREATE OR REPLACE TEMP TABLE d_jobs AS
WITH slots AS (
    SELECT d.*, unnest([1, 2, 3]) AS k FROM d_vm d
),
drawn AS (
    SELECT *, vehicle_id || '|' || month_start || '|' || k AS jk,
           rnd(vehicle_id || '|' || month_start || '|' || k || 'job') AS r,
           CASE powertrain WHEN 'ICE' THEN 1.25 WHEN 'BEV' THEN 0.85 WHEN 'PHEV' THEN 1.05 ELSE 1.0 END AS pt_rate
    FROM slots
),
corrective AS (
    SELECT *,
        CASE WHEN rnd(jk || 't') < 0.52 THEN 'Repair'
             WHEN rnd(jk || 't') < 0.72 THEN 'Warranty'
             WHEN rnd(jk || 't') < 0.87 THEN 'Collision'
             ELSE 'Tyres' END AS job_type
    FROM drawn
    WHERE (k = 1 AND r < 0.18 * pt_rate * days / 30.0)
       OR (k = 2 AND r < 0.05 * pt_rate * days / 30.0)
       OR (k = 3 AND r < 0.015 * pt_rate * days / 30.0)
),
pm AS (
    SELECT p.*, p.vehicle_id || '|' || p.month_start || '|pm' AS jk, 'Preventive maintenance' AS job_type
    FROM d_pm p
    WHERE p.pm_due > 0
      AND rnd(p.vehicle_id || p.month_start || 'skip') >=
          CASE WHEN p.home_site_id = 'WS04' AND p.month_start BETWEEN DATE '2026-03-01' AND DATE '2026-06-30' THEN 0.20 ELSE 0.03 END
),
allj AS (
    SELECT vehicle_id, region, powertrain, home_site_id, in_service_date, month_start, days, jk, job_type FROM corrective
    UNION ALL
    SELECT vehicle_id, region, powertrain, home_site_id, in_service_date, month_start, days, jk, job_type FROM pm
),
dated AS (
    SELECT a.*,
        greatest(a.month_start, a.in_service_date)::TIMESTAMP
            + to_days(CAST(floor(rnd(a.jk || 'd') * a.days) AS INTEGER))
            + to_hours(CAST(7 + floor(rnd(a.jk || 'h') * 12) AS INTEGER)) AS opened_at
    FROM allj a
),
routed AS (
    SELECT d.*,
        CASE WHEN hs.open_date <= d.opened_at::DATE THEN d.home_site_id
             ELSE (SELECT min_by(s2.site_id, s2.open_date) FROM sites s2 WHERE s2.region = d.region) END AS site_id
    FROM dated d JOIN sites hs ON hs.site_id = d.home_site_id
),
phased AS (
    SELECT *,
        (site_id = 'WS04' AND opened_at >= TIMESTAMP '2026-03-01' AND opened_at < TIMESTAMP '2026-07-01') AS rn_crisis,
        (site_id = 'WS04' AND opened_at >= TIMESTAMP '2026-07-01')                                       AS rn_recovered,
        (site_id = 'WS12' AND opened_at <  TIMESTAMP '2025-10-01')                                       AS ist_before,
        (site_id = 'WS12' AND opened_at >= TIMESTAMP '2025-10-01')                                       AS ist_after
    FROM routed
)
SELECT *,
    round((3 + 20 * rnd(jk || 'q')) *
          CASE WHEN rn_crisis THEN 2.3 WHEN ist_before THEN 1.8
               WHEN rn_recovered OR ist_after THEN 0.85 ELSE 1.0 END
          * CASE WHEN job_type = 'Preventive maintenance' THEN 0.35 ELSE 1.0 END, 1) AS queue_h,  -- PM is booked, mostly same-day
    round(CASE job_type
        WHEN 'Preventive maintenance' THEN CASE powertrain WHEN 'BEV' THEN 1.0 + rnd(jk || 'l') ELSE 1.5 + 1.2 * rnd(jk || 'l') END
        WHEN 'Repair'    THEN 2.0 + 6.0 * rnd(jk || 'l')
        WHEN 'Warranty'  THEN 2.0 + 8.0 * rnd(jk || 'l')
        WHEN 'Collision' THEN 6.0 + 24.0 * rnd(jk || 'l')
        ELSE 0.8 + 1.2 * rnd(jk || 'l') END, 1) AS labour_h,
    rnd(jk || 'p') < CASE job_type
        WHEN 'Preventive maintenance' THEN 0.04 WHEN 'Repair' THEN 0.35
        WHEN 'Warranty' THEN 0.50 WHEN 'Collision' THEN 0.70 ELSE 0.20 END
        + CASE WHEN rn_crisis THEN 0.25 ELSE 0 END AS parts_needed
FROM phased;

CREATE OR REPLACE TEMP TABLE d_jobs_costed AS
SELECT *,
    CASE WHEN parts_needed
         THEN round((8 + 70 * rnd(jk || 'pw')) * CASE WHEN rn_crisis THEN 2.4 WHEN ist_before THEN 1.4 ELSE 1.0 END, 1)
         ELSE 0 END AS parts_wait_h,
    rnd(jk || 'rv') < 0.06 + CASE WHEN ist_before THEN 0.10 WHEN rn_crisis THEN 0.07 ELSE 0 END AS repeat_visit,
    round(labour_h * 62 + CASE
        WHEN job_type = 'Preventive maintenance' THEN
            CASE powertrain WHEN 'BEV' THEN 60 + 70 * rnd(jk || 'pc') WHEN 'ICE' THEN 110 + 90 * rnd(jk || 'pc')
                            ELSE 130 + 100 * rnd(jk || 'pc') END
        WHEN parts_needed THEN
            CASE job_type WHEN 'Collision' THEN 600 + 2400 * rnd(jk || 'pc')
                          WHEN 'Warranty'  THEN 250 + 1200 * rnd(jk || 'pc')
                          ELSE 120 + 800 * rnd(jk || 'pc') END
        ELSE 40 END, 2) AS total_cost,
    CASE WHEN job_type = 'Warranty' THEN 'OEM' ELSE 'Fleet' END AS paid_by
FROM d_jobs;

-- ----------------------------------------------------------------- recalls
CREATE OR REPLACE TABLE recalls AS
SELECT * FROM (VALUES
    ('RC-25-01', 'Front suspension link inspection', DATE '2025-09-01'),
    ('RC-26-02', 'HV connector seal replacement',    DATE '2026-04-15')
) t(campaign_id, title, launch_date);

CREATE OR REPLACE TABLE recall_vehicles AS
SELECT 'RC-25-01' AS campaign_id, vehicle_id FROM vehicles WHERE model LIKE 'S1%' AND in_service_date < DATE '2025-06-01'
UNION ALL
SELECT 'RC-26-02', vehicle_id FROM vehicles WHERE model = 'X2 SUV EV' AND in_service_date < DATE '2026-02-01';

CREATE OR REPLACE TEMP TABLE d_recall_jobs AS
WITH fixes AS (
    SELECT rv.campaign_id, rv.vehicle_id, v.region, v.home_site_id, r.launch_date,
           rv.campaign_id || '|' || rv.vehicle_id AS jk,
           CAST(floor(-ln(1 - rnd(rv.campaign_id || rv.vehicle_id || 'ttf')) * 45 *
                CASE v.region WHEN 'KSA' THEN 1.7 WHEN 'Türkiye' THEN 0.75 ELSE 1.0 END) AS INTEGER) AS days_to_fix
    FROM recall_vehicles rv JOIN recalls r USING (campaign_id) JOIN vehicles v USING (vehicle_id)
),
dated AS (
    SELECT *, launch_date::TIMESTAMP + to_days(days_to_fix) + to_hours(CAST(8 + floor(rnd(jk || 'h') * 10) AS INTEGER)) AS opened_at
    FROM fixes
)
SELECT d.*,
    CASE WHEN hs.open_date <= d.opened_at::DATE THEN d.home_site_id
         ELSE (SELECT min_by(s2.site_id, s2.open_date) FROM sites s2 WHERE s2.region = d.region) END AS site_id,
    round(2 + 10 * rnd(d.jk || 'q'), 1) + round(1.0 + 1.5 * rnd(d.jk || 'l'), 1) AS turnaround_h,
    round(1.0 + 1.5 * rnd(d.jk || 'l'), 1) AS labour_h,
    round(70 + 60 * rnd(d.jk || 'c'), 2) AS total_cost
FROM dated d JOIN sites hs ON hs.site_id = d.home_site_id
WHERE d.opened_at < TIMESTAMP '2026-10-01';

-- --------------------------------------------------- canonical work_orders
CREATE OR REPLACE TABLE work_orders AS
WITH unioned AS (
    SELECT jk, vehicle_id, site_id, job_type, opened_at,
           queue_h + labour_h + parts_wait_h AS turnaround_h,
           labour_h, parts_wait_h, total_cost, paid_by, repeat_visit, CAST(NULL AS VARCHAR) AS campaign_id
    FROM d_jobs_costed
    UNION ALL
    SELECT jk, vehicle_id, site_id, 'Recall', opened_at, turnaround_h, labour_h, 0, total_cost, 'OEM', FALSE, campaign_id
    FROM d_recall_jobs
)
SELECT
    'WO' || lpad((row_number() OVER (ORDER BY opened_at, jk))::VARCHAR, 7, '0') AS work_order_id,
    vehicle_id, site_id, job_type, opened_at,
    CASE WHEN opened_at + to_minutes(CAST(round(turnaround_h * 60) AS INTEGER)) < TIMESTAMP '2026-10-01'
         THEN opened_at + to_minutes(CAST(round(turnaround_h * 60) AS INTEGER)) END AS closed_at,
    labour_h AS labour_hours, parts_wait_h AS parts_wait_hours, total_cost, paid_by, repeat_visit, campaign_id
FROM unioned;

-- ---------------------------------------------------------------- budgets
CREATE OR REPLACE TABLE budgets AS
SELECT d.region, d.month_start AS month, round(sum(d.days / 30.0) * any_value(r.budget_pvm), 0) AS budget
FROM d_vm d JOIN d_regions r USING (region)
GROUP BY ALL;
