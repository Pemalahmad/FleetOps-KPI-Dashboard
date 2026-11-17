-- =====================================================================
-- Synthetic data generator: "Sahra Mobility", a FICTIONAL EV fleet
-- operator running ride-hail and delivery fleets across the GCC and
-- Türkiye, with its own service-center network.
--
-- Everything here is invented. No real company, employer data or
-- customer data is used. Randomness is hash-based, so every build
-- produces exactly the same dataset.
--
-- Analysis window: 2025-04-01 to 2026-09-30 (18 months). "Today" = 2026-10-01.
--
-- Two operating stories are planted for the KPIs to find:
--   1. Riyadh North (center 4): a parts shortage plus technician attrition
--      (Mar-Jun 2026) blows out turnaround; an intervention in Jul 2026
--      recovers it.
--   2. Istanbul Asia (center 12) underperforms until a turnaround in
--      Oct 2025: lower queue, fewer repeat visits.
-- =====================================================================

-- Deterministic pseudo-random number in [0,1) from any string key.
CREATE OR REPLACE MACRO rnd(k) AS (hash(k) % 1000000)::DOUBLE / 1000000.0;

-- ---------------------------------------------------------------- markets
CREATE OR REPLACE TABLE markets AS
SELECT * FROM (VALUES
    (1, 'UAE',     'GCC',     DATE '2024-01-01', 1800, 168.0),
    (2, 'KSA',     'GCC',     DATE '2025-07-01', 1500, 160.0),
    (3, 'Qatar',   'GCC',     DATE '2024-06-01',  500, 165.0),
    (4, 'Kuwait',  'GCC',     DATE '2024-09-01',  400, 170.0),
    (5, 'Bahrain', 'GCC',     DATE '2025-01-01',  250, 170.0),
    (6, 'Oman',    'GCC',     DATE '2025-03-01',  250, 170.0),
    (7, 'Türkiye', 'Türkiye', DATE '2024-03-01', 1800, 155.0)
) t(market_id, market, cluster, launch_date, target_fleet, budget_per_vehicle_month_usd);

-- -------------------------------------------------------- service centers
CREATE OR REPLACE TABLE service_centers AS
SELECT * FROM (VALUES
    ( 1, 1, 'Dubai Al Quoz',          14, 10, DATE '2024-01-01'),
    ( 2, 1, 'Dubai JAFZA',            10,  8, DATE '2024-06-01'),
    ( 3, 1, 'Abu Dhabi Mussafah',     10,  8, DATE '2024-03-01'),
    ( 4, 2, 'Riyadh North',           12, 10, DATE '2025-07-01'),
    ( 5, 2, 'Riyadh South',           10,  8, DATE '2025-07-01'),
    ( 6, 2, 'Jeddah',                  8,  6, DATE '2025-10-01'),
    ( 7, 2, 'Dammam',                  6,  5, DATE '2026-01-01'),
    ( 8, 3, 'Doha Industrial Area',    9,  7, DATE '2024-06-01'),
    ( 9, 4, 'Kuwait Shuwaikh',         8,  6, DATE '2024-09-01'),
    (10, 5, 'Bahrain Sitra',           5,  4, DATE '2025-01-01'),
    (11, 6, 'Muscat Ghala',            5,  4, DATE '2025-03-01'),
    (12, 7, 'Istanbul Asia (Tuzla)',  12, 10, DATE '2024-03-01'),
    (13, 7, 'Istanbul Europe',        12, 10, DATE '2024-03-01'),
    (14, 7, 'Ankara',                  8,  6, DATE '2024-06-01'),
    (15, 7, 'Izmir',                   7,  5, DATE '2024-09-01')
) t(center_id, market_id, center, technicians, service_bays, open_date);

-- ---------------------------------------------------------------- vehicles
CREATE OR REPLACE TABLE vehicles AS
WITH base AS (
    SELECT market_id, launch_date,
           unnest(generate_series(1, target_fleet)) AS n
    FROM markets
),
ids AS (
    SELECT *, 'V' || lpad(market_id::VARCHAR, 2, '0') || lpad(n::VARCHAR, 5, '0') AS vehicle_id
    FROM base
),
center_lists AS (
    SELECT market_id, list(center_id ORDER BY center_id) AS center_ids
    FROM service_centers GROUP BY market_id
)
SELECT
    i.vehicle_id,
    i.market_id,
    CASE WHEN rnd(i.vehicle_id || 'model') < 0.60 THEN 'S1 Sedan'
         WHEN rnd(i.vehicle_id || 'model') < 0.88 THEN 'X2 SUV'
         ELSE 'V3 Van' END                                            AS model,
    CASE WHEN rnd(i.vehicle_id || 'model') < 0.88 THEN 'Ride-hail' ELSE 'Delivery' END AS fleet_use,
    (i.launch_date + CAST(floor(pow(rnd(i.vehicle_id || 'isd'), 1.2)
         * date_diff('day', i.launch_date, DATE '2026-08-31')) AS INTEGER))::DATE AS in_service_date,
    c.center_ids[1 + CAST(floor(rnd(i.vehicle_id || 'hc') * len(c.center_ids)) AS INTEGER)] AS home_center_id
FROM ids i
JOIN center_lists c USING (market_id);

-- --------------------------------------------- vehicle-months (utilization)
CREATE OR REPLACE TABLE vehicle_months AS
WITH months AS (
    SELECT unnest(generate_series(DATE '2025-04-01', DATE '2026-09-01', INTERVAL 1 MONTH))::DATE AS month_start
)
SELECT
    v.vehicle_id, v.market_id, v.model, v.fleet_use, m.month_start,
    date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1 AS days_in_service,
    -- Operating hours: target 16h/day; summer heat in the GCC lowers demand, delivery vans run steadier.
    round((date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1) * 16
        * (0.58 + 0.27 * rnd(v.vehicle_id || m.month_start || 'u'))
        * CASE WHEN v.market_id <> 7 AND month(m.month_start) IN (6, 7, 8) THEN 0.88 ELSE 1.0 END
        * CASE WHEN v.fleet_use = 'Delivery' THEN 1.08 ELSE 1.0 END, 1) AS active_hours,
    round((date_diff('day', greatest(m.month_start, v.in_service_date), last_day(m.month_start)) + 1)
        * (140 + 120 * rnd(v.vehicle_id || m.month_start || 'km')), 0) AS km
FROM vehicles v
JOIN months m ON v.in_service_date <= last_day(m.month_start);

-- ------------------------------------------------------- recall campaigns
CREATE OR REPLACE TABLE recall_campaigns AS
SELECT * FROM (VALUES
    ('RC-25-01', 'Front suspension link inspection', 'S1 Sedan', DATE '2025-06-01', DATE '2025-09-01'),
    ('RC-26-02', 'HV connector seal replacement',    'X2 SUV',   DATE '2026-02-01', DATE '2026-04-15')
) t(campaign_id, title, model, built_before, launch_date);

CREATE OR REPLACE TABLE recall_campaign_vehicles AS
SELECT r.campaign_id, v.vehicle_id, v.market_id
FROM recall_campaigns r
JOIN vehicles v ON v.model = r.model AND v.in_service_date < r.built_before;

-- ------------------------------------------------------------ service jobs
CREATE OR REPLACE TABLE service_jobs AS
WITH slots AS (
    SELECT vm.*, unnest([1, 2, 3]) AS k FROM vehicle_months vm
),
drawn AS (
    SELECT *, vehicle_id || '|' || month_start || '|' || k AS jk,
           rnd(vehicle_id || '|' || month_start || '|' || k || 'job') AS r
    FROM slots
),
picked AS (
    SELECT * FROM drawn
    WHERE (k = 1 AND r < 0.26 * days_in_service / 30.0)
       OR (k = 2 AND r < 0.08 * days_in_service / 30.0)
       OR (k = 3 AND r < 0.02 * days_in_service / 30.0)
),
typed AS (
    SELECT p.*,
        CASE WHEN rnd(jk || 't') < 0.44 THEN 'Scheduled maintenance'
             WHEN rnd(jk || 't') < 0.74 THEN 'Repair'
             WHEN rnd(jk || 't') < 0.86 THEN 'Warranty'
             WHEN rnd(jk || 't') < 0.94 THEN 'Collision'
             ELSE 'Tyres' END AS job_type,
        greatest(p.month_start, v.in_service_date)::TIMESTAMP
            + to_days(CAST(floor(rnd(jk || 'd') * p.days_in_service) AS INTEGER))
            + to_hours(CAST(7 + floor(rnd(jk || 'h') * 12) AS INTEGER)) AS opened_at,
        v.home_center_id
    FROM picked p JOIN vehicles v USING (vehicle_id)
),
routed AS (
    -- A vehicle whose home center has not opened yet is served by the market's first center.
    SELECT t.*,
        CASE WHEN hc.open_date <= t.opened_at::DATE THEN t.home_center_id
             ELSE (SELECT min_by(c2.center_id, c2.open_date) FROM service_centers c2
                   WHERE c2.market_id = t.market_id) END AS center_id
    FROM typed t JOIN service_centers hc ON hc.center_id = t.home_center_id
),
phased AS (
    SELECT *,
        (center_id = 4  AND opened_at >= TIMESTAMP '2026-03-01' AND opened_at < TIMESTAMP '2026-07-01') AS rn_crisis,
        (center_id = 4  AND opened_at >= TIMESTAMP '2026-07-01')                                       AS rn_recovered,
        (center_id = 12 AND opened_at <  TIMESTAMP '2025-10-01')                                       AS ist_before,
        (center_id = 12 AND opened_at >= TIMESTAMP '2025-10-01')                                       AS ist_after
    FROM routed
),
costed AS (
    SELECT *,
        round((3 + 20 * rnd(jk || 'q')) *
              CASE WHEN rn_crisis THEN 2.3 WHEN ist_before THEN 1.8
                   WHEN rn_recovered THEN 0.85 WHEN ist_after THEN 0.85 ELSE 1.0 END, 1) AS queue_h,
        round(CASE job_type
            WHEN 'Scheduled maintenance' THEN 1.5 + 1.5 * rnd(jk || 'l')
            WHEN 'Repair'                THEN 2.0 + 6.0 * rnd(jk || 'l')
            WHEN 'Warranty'              THEN 2.0 + 8.0 * rnd(jk || 'l')
            WHEN 'Collision'             THEN 6.0 + 24.0 * rnd(jk || 'l')
            ELSE 0.8 + 1.2 * rnd(jk || 'l') END, 1) AS labour_h,
        rnd(jk || 'p') < CASE job_type
            WHEN 'Scheduled maintenance' THEN 0.05 WHEN 'Repair' THEN 0.35
            WHEN 'Warranty' THEN 0.50 WHEN 'Collision' THEN 0.70 ELSE 0.20 END
            + CASE WHEN rn_crisis THEN 0.25 ELSE 0 END AS parts_needed
    FROM phased
)
SELECT
    jk                                                     AS job_key,
    vehicle_id, market_id, center_id, job_type,
    CAST(NULL AS VARCHAR)                                  AS campaign_id,
    opened_at,
    queue_h, labour_h,
    CASE WHEN parts_needed
         THEN round((8 + 70 * rnd(jk || 'pw')) *
                    CASE WHEN rn_crisis THEN 2.4 WHEN ist_before THEN 1.4 ELSE 1.0 END, 1)
         ELSE 0 END                                        AS parts_wait_h,
    rnd(jk || 'rv') < 0.06 + CASE WHEN ist_before THEN 0.10 WHEN rn_crisis THEN 0.07 ELSE 0 END AS repeat_visit,
    round(labour_h * 62 + CASE WHEN parts_needed THEN
        CASE job_type WHEN 'Collision' THEN 600 + 2400 * rnd(jk || 'pc')
                      WHEN 'Warranty'  THEN 250 + 1200 * rnd(jk || 'pc')
                      ELSE 120 + 800 * rnd(jk || 'pc') END
        ELSE 40 END, 2)                                    AS cost_usd,
    CASE WHEN job_type = 'Warranty' THEN 'OEM' ELSE 'Fleet' END AS paid_by
FROM costed;

-- Recall work orders join the same table.
INSERT INTO service_jobs
WITH fixes AS (
    SELECT cv.*, r.launch_date, v.home_center_id,
        cv.campaign_id || '|' || cv.vehicle_id AS jk,
        -- Exponential time-to-fix; KSA's young network is slower, Türkiye's mature one faster.
        CAST(floor(-ln(1 - rnd(cv.campaign_id || cv.vehicle_id || 'ttf')) * 45 *
             CASE cv.market_id WHEN 2 THEN 1.7 WHEN 7 THEN 0.75 ELSE 1.0 END) AS INTEGER) AS days_to_fix
    FROM recall_campaign_vehicles cv
    JOIN recall_campaigns r USING (campaign_id)
    JOIN vehicles v USING (vehicle_id)
),
dated AS (
    SELECT *, launch_date::TIMESTAMP + to_days(days_to_fix)
              + to_hours(CAST(8 + floor(rnd(jk || 'h') * 10) AS INTEGER)) AS opened_at
    FROM fixes
)
SELECT
    d.jk, d.vehicle_id, d.market_id,
    CASE WHEN hc.open_date <= d.opened_at::DATE THEN d.home_center_id
         ELSE (SELECT min_by(c2.center_id, c2.open_date) FROM service_centers c2
               WHERE c2.market_id = d.market_id) END,
    'Recall', d.campaign_id, d.opened_at,
    round(2 + 10 * rnd(d.jk || 'q'), 1), round(1.0 + 1.5 * rnd(d.jk || 'l'), 1),
    0, FALSE, round(70 + 60 * rnd(d.jk || 'c'), 2), 'OEM'
FROM dated d
JOIN service_centers hc ON hc.center_id = d.home_center_id
WHERE d.opened_at < TIMESTAMP '2026-10-01';

-- Final shape: ids, close timestamps, open backlog at the snapshot date.
CREATE OR REPLACE TABLE service_jobs AS
SELECT
    row_number() OVER (ORDER BY opened_at, job_key)        AS job_id,
    * EXCLUDE (job_key),
    round(queue_h + labour_h + parts_wait_h, 1)            AS turnaround_h,
    CASE WHEN opened_at + to_minutes(CAST(round((queue_h + labour_h + parts_wait_h) * 60) AS INTEGER))
              < TIMESTAMP '2026-10-01'
         THEN opened_at + to_minutes(CAST(round((queue_h + labour_h + parts_wait_h) * 60) AS INTEGER))
         END                                               AS closed_at
FROM service_jobs;
