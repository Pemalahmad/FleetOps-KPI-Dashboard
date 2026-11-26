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
    ('WS01', 'Dubai Al Quoz',         'UAE',     'workshop', 8, DATE '2024-01-01'),
    ('WS02', 'Dubai JAFZA',           'UAE',     'workshop', 8, DATE '2024-06-01'),
    ('WS03', 'Abu Dhabi Mussafah',    'UAE',     'workshop', 8, DATE '2024-03-01'),
    ('WS04', 'Riyadh North',          'KSA',     'workshop', 7, DATE '2025-07-01'),
    ('WS05', 'Riyadh South',          'KSA',     'workshop', 6, DATE '2025-07-01'),
    ('WS06', 'Jeddah',                'KSA',     'workshop',  5, DATE '2025-10-01'),
    ('WS07', 'Dammam',                'KSA',     'workshop',  5, DATE '2026-01-01'),
    ('WS08', 'Doha Industrial Area',  'Qatar',   'workshop',  7, DATE '2024-06-01'),
    ('WS09', 'Kuwait Shuwaikh',       'Kuwait',  'workshop',  5, DATE '2024-09-01'),
    ('WS10', 'Bahrain Sitra',         'Bahrain', 'workshop',  4, DATE '2025-01-01'),
    ('WS11', 'Muscat Ghala',          'Oman',    'workshop',  4, DATE '2025-03-01'),
    ('WS12', 'Istanbul Asia (Tuzla)', 'Türkiye', 'workshop', 7, DATE '2024-03-01'),
    ('WS13', 'Istanbul Europe',       'Türkiye', 'workshop', 7, DATE '2024-03-01'),
    ('WS14', 'Ankara',                'Türkiye', 'workshop',  5, DATE '2024-06-01'),
    ('WS15', 'Izmir',                 'Türkiye', 'workshop',  6, DATE '2024-09-01')
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
    CASE WHEN is_delivery THEN 'Delivery' ELSE 'Ride-hail' END AS use_case,
    -- Synthetic registry facts, including cases with no inspection and vehicles cleared by evidence.
    CASE region
        WHEN 'Bahrain' THEN CASE WHEN n = 1 THEN NULL WHEN n = 4 OR (n > 5 AND is_delivery) THEN 'Private transport' ELSE 'خصوصي' END
        WHEN 'UAE' THEN CASE WHEN n BETWEEN 1 AND 2 THEN 'Heavy vehicle' WHEN is_delivery THEN 'Light commercial vehicle' ELSE 'Private light vehicle' END
        WHEN 'KSA' THEN CASE WHEN n BETWEEN 1 AND 2 THEN 'Taxi' WHEN is_delivery THEN 'Public transport' ELSE 'Private' END
        WHEN 'Qatar' THEN CASE WHEN n BETWEEN 2 AND 3 THEN 'Rental car' WHEN is_delivery THEN 'Private transport' ELSE 'Private car' END
        WHEN 'Kuwait' THEN CASE WHEN n BETWEEN 1 AND 2 THEN 'Taxi' WHEN is_delivery THEN 'Private transport' ELSE 'Private car' END
        WHEN 'Oman' THEN CASE WHEN is_delivery THEN 'Commercial truck' ELSE 'Private car' END
    END AS registration_class,
    CASE WHEN region = 'Bahrain' AND n = 2 THEN DATE '2021-10-01'
         WHEN region = 'Bahrain' AND n = 3 THEN DATE '2021-09-30'
         WHEN region = 'Oman' AND n IN (1, 7) THEN DATE '2016-10-01'
         WHEN region = 'KSA' AND n BETWEEN 1 AND 2 THEN DATE '2024-09-25'
         WHEN region <> 'Türkiye' THEN in_service_date END AS manufacture_date,
    CASE WHEN region = 'KSA' AND n BETWEEN 1 AND 2 THEN DATE '2024-10-01'
         WHEN region IN ('UAE', 'KSA', 'Qatar', 'Kuwait') THEN in_service_date END AS first_registration_date,
    CASE WHEN region = 'UAE' AND n BETWEEN 1 AND 2 THEN FALSE
         WHEN region IN ('UAE', 'KSA', 'Qatar', 'Kuwait') THEN TRUE END AS registered_as_new,
    CASE WHEN region = 'UAE' THEN 'Dubai' END AS registration_jurisdiction,
    CASE WHEN region = 'Qatar' AND is_delivery THEN 'Company' END AS registration_owner_type,
    CASE WHEN region = 'Qatar' AND is_delivery THEN 2500 END AS registration_weight_kg,
    CAST(NULL AS BOOLEAN) AS vehicle_advertising,
    CASE WHEN region = 'UAE' AND is_delivery THEN CAST(in_service_date + INTERVAL 1 YEAR AS DATE)
         WHEN region = 'UAE' THEN make_date(year(in_service_date) + 3, 1, 1)
         WHEN region = 'Kuwait' THEN CAST(in_service_date + to_years(CASE WHEN is_delivery THEN 2 ELSE 3 END) AS DATE)
    END AS inspection_due_date,
    CASE WHEN region IN ('UAE', 'Kuwait') THEN 'SYNTHETIC-' || vehicle_id END AS inspection_schedule_reference,
    region = 'Bahrain' AND n = 5 AS inspection_required_by_authority,
    -- Annual registration from the in-service anniversary; ~1.5% lapsed, renewals spread over the year.
    CASE WHEN region = 'Bahrain' AND n BETWEEN 2 AND 4 THEN DATE '2026-10-18'
         WHEN region = 'Bahrain' AND n = 5 THEN DATE '2027-01-31'
         WHEN (region IN ('UAE', 'Kuwait') AND n BETWEEN 1 AND 2) OR
              (region = 'Oman' AND n IN (1, 7)) OR (region = 'Qatar' AND n BETWEEN 2 AND 3) THEN DATE '2026-10-18'
         WHEN rnd(vehicle_id || 'regx') < 0.015
         THEN DATE '2026-10-01' - to_days(CAST(1 + floor(rnd(vehicle_id || 'regd') * 40) AS INTEGER))
         ELSE DATE '2026-10-01' + to_days(CAST(1 + floor(rnd(vehicle_id || 'regd') * 364) AS INTEGER)) END::DATE AS registration_expiry,
    -- Annual insurance policies, renewals spread over the year; ~2% lapsed.
    CASE WHEN region = 'Bahrain' AND n BETWEEN 2 AND 5 THEN DATE '2027-06-30'
         WHEN rnd(vehicle_id || 'insx') < 0.02
         THEN DATE '2026-10-01' - to_days(CAST(1 + floor(rnd(vehicle_id || 'insd') * 30) AS INTEGER))
         ELSE DATE '2026-10-01' + to_days(CAST(1 + floor(rnd(vehicle_id || 'insd') * 364) AS INTEGER)) END::DATE AS insurance_expiry,
    ['Gulf Insurance', 'Oasis Assurance', 'Crescent Mutual', 'Anatolia Sigorta'][
        CASE WHEN region = 'Türkiye' THEN 4 ELSE 1 + CAST(floor(rnd(vehicle_id || 'ins') * 3) AS INTEGER) END] AS insurer
FROM typed;

-- ---------------------------------------------------------- vehicle identity: VIN, plate, year, trim, configuration
CREATE OR REPLACE TEMP TABLE d_ident AS
SELECT vehicle_id,
       -- SHR = Sahra (fictional WMI) · line · powertrain · 3 chars · check '0' · model-year code · plant · serial
       'SHR' || substr(model, 1, 1) || CASE powertrain WHEN 'BEV' THEN 'E' WHEN 'PHEV' THEN 'P' WHEN 'HEV' THEN 'H'
                                        ELSE CASE WHEN fuel_type = 'diesel' THEN 'D' ELSE 'G' END END
           || substr('ABCDEFGHJKLMNPRSTUVWXYZ0123456789', 1 + CAST(floor(rnd(vehicle_id || 'v1') * 33) AS INTEGER), 1)
           || substr('ABCDEFGHJKLMNPRSTUVWXYZ0123456789', 1 + CAST(floor(rnd(vehicle_id || 'v2') * 33) AS INTEGER), 1)
           || substr('ABCDEFGHJKLMNPRSTUVWXYZ0123456789', 1 + CAST(floor(rnd(vehicle_id || 'v3') * 33) AS INTEGER), 1)
           || '0'
           || substr('ABCDEFGHJKLMNPRSTVWXY123456789',
                     1 + (year(in_service_date) + CASE WHEN rnd(vehicle_id || 'my') < 0.3 THEN 1 ELSE 0 END - 1980) % 30, 1)
           || CASE region WHEN 'Türkiye' THEN 'T' WHEN 'KSA' THEN 'K' ELSE 'U' END
           || lpad(CAST(100000 + CAST(floor(rnd(vehicle_id || 'sn') * 899999) AS INTEGER) AS VARCHAR), 6, '0') AS vin,
       CASE region
           WHEN 'UAE' THEN chr(65 + CAST(floor(rnd(vehicle_id || 'pl') * 20) AS INTEGER)) || ' ' || lpad(CAST(floor(rnd(vehicle_id || 'pn') * 99999) AS INTEGER)::VARCHAR, 5, '0')
           WHEN 'KSA' THEN lpad(CAST(floor(rnd(vehicle_id || 'pn') * 9999) AS INTEGER)::VARCHAR, 4, '0') || ' ' || ['ABD', 'RSA', 'KHD', 'NJM'][1 + CAST(floor(rnd(vehicle_id || 'pl') * 4) AS INTEGER)]
           WHEN 'Türkiye' THEN '34 ' || ['FT', 'KL', 'MR', 'AB'][1 + CAST(floor(rnd(vehicle_id || 'pl') * 4) AS INTEGER)] || ' ' || lpad(CAST(floor(rnd(vehicle_id || 'pn') * 999) AS INTEGER)::VARCHAR, 3, '0')
           ELSE upper(substr(region, 1, 2)) || ' ' || lpad(CAST(floor(rnd(vehicle_id || 'pn') * 99999) AS INTEGER)::VARCHAR, 5, '0') END AS plate_number,
       year(in_service_date) + CASE WHEN rnd(vehicle_id || 'my') < 0.3 THEN 1 ELSE 0 END AS model_year,
       CASE WHEN model LIKE '%EV' THEN ['Standard Range', 'Long Range', 'Performance'][1 + CAST(floor(pow(rnd(vehicle_id || 'tr'), 1.6) * 3) AS INTEGER)]
            WHEN model LIKE '%PHEV' THEN ['Plug-in Comfort', 'Plug-in Premium'][1 + CAST(floor(rnd(vehicle_id || 'tr') * 2) AS INTEGER)]
            WHEN model LIKE '%Hybrid' THEN ['Hybrid', 'Hybrid Comfort'][1 + CAST(floor(rnd(vehicle_id || 'tr') * 2) AS INTEGER)]
            WHEN model LIKE 'V3%' THEN ['Panel Van', 'Crew Van'][1 + CAST(floor(rnd(vehicle_id || 'tr') * 2) AS INTEGER)]
            ELSE ['Base', 'Comfort'][1 + CAST(floor(rnd(vehicle_id || 'tr') * 2) AS INTEGER)] END AS trim,
       powertrain, model, fuel_type, region
FROM vehicles;

CREATE OR REPLACE TEMP TABLE d_ident2 AS
SELECT i.*,
       CASE WHEN i.model = 'S1 Sedan EV' THEN CASE i.trim WHEN 'Standard Range' THEN '60 kWh · RWD · 5 seats' WHEN 'Long Range' THEN '82 kWh · RWD · 5 seats' ELSE '82 kWh · AWD · 5 seats' END
            WHEN i.model = 'X2 SUV EV' THEN CASE i.trim WHEN 'Standard Range' THEN '75 kWh · FWD · 7 seats' WHEN 'Long Range' THEN '95 kWh · AWD · 7 seats' ELSE '95 kWh · AWD · 7 seats · tow pack' END
            WHEN i.powertrain = 'PHEV' THEN '18 kWh + 1.5T · AWD · 7 seats'
            WHEN i.powertrain = 'HEV' THEN '1.8L hybrid · FWD · 5 seats'
            WHEN i.fuel_type = 'diesel' THEN '2.0L diesel · RWD · 3.5 t'
            ELSE '1.6L petrol · FWD · 5 seats' END AS configuration,
       ['White', 'White', 'White', 'Silver', 'Black', 'Grey', 'Blue'][1 + CAST(floor(rnd(i.vehicle_id || 'col') * 7) AS INTEGER)] AS color
FROM d_ident i;

CREATE OR REPLACE TABLE vehicles AS
SELECT v.*,
       -- a little dirt, as real registers have: 0.3% VINs typed with a letter O, and one VIN on two vehicles
       CASE WHEN rnd(v.vehicle_id || 'vbad') < 0.003 THEN substr(i.vin, 1, 11) || 'O' || substr(i.vin, 13)
            WHEN v.vehicle_id = (SELECT max(vehicle_id) FROM vehicles) THEN (SELECT i2.vin FROM d_ident2 i2 ORDER BY i2.vehicle_id LIMIT 1)
            ELSE i.vin END AS vin,
       i.plate_number, i.model_year, i.trim, i.configuration, i.color
FROM vehicles v JOIN d_ident2 i USING (vehicle_id);

-- ------------------------------------------------------------- documents: registration cards and insurance policies
CREATE OR REPLACE TABLE documents AS
WITH reg AS (
    SELECT v.vehicle_id, v.vin, v.plate_number, v.registration_expiry AS expiry,
           -- 4% of cards were renewed and scanned, but the vehicle file was never updated
           CASE WHEN v.vehicle_id NOT IN (
                    'V0100002', 'V0100003', 'V0100004', 'V0300001', 'V0300002', 'V0400001', 'V0400007',
                    'V0500002', 'V0500003', 'V0700001', 'V0700002')
                     AND rnd(v.vehicle_id || 'drn') < 0.04 AND v.registration_expiry < DATE '2026-12-01'
                THEN v.registration_expiry + INTERVAL 1 YEAR ELSE v.registration_expiry END::DATE AS doc_expiry,
           CASE v.region WHEN 'UAE' THEN 'RTA' WHEN 'KSA' THEN 'Muroor' WHEN 'Türkiye' THEN 'Emniyet' ELSE 'Traffic Department' END AS issuer
    FROM vehicles v WHERE rnd(v.vehicle_id || 'dreg') < 0.9
)
SELECT 'REG-' || vehicle_id AS document_id,
       CASE WHEN rnd(vehicle_id || 'dref') < 0.6 THEN plate_number WHEN rnd(vehicle_id || 'dref') < 0.9 THEN vin ELSE vehicle_id END AS vehicle_ref,
       'Registration card' AS doc_type,
       lpad(CAST(floor(rnd(vehicle_id || 'dno') * 999999999) AS BIGINT)::VARCHAR, 9, '0') AS document_number,
       (doc_expiry - INTERVAL 1 YEAR + INTERVAL 1 DAY)::DATE AS issue_date, doc_expiry AS expiry_date, issuer,
       'mulkiya-' || replace(plate_number, ' ', '') || '.jpg' AS file_name,
       NULL::VARCHAR AS inspection_result
FROM reg
UNION ALL
SELECT 'INS-' || v.vehicle_id, v.plate_number, 'Insurance policy',
       'POL-' || lpad(CAST(floor(rnd(v.vehicle_id || 'pol') * 9999999) AS INTEGER)::VARCHAR, 7, '0'),
       (v.insurance_expiry - INTERVAL 1 YEAR + INTERVAL 1 DAY)::DATE, v.insurance_expiry, v.insurer,
       'policy-' || v.vehicle_id || '.pdf', NULL
FROM vehicles v WHERE rnd(v.vehicle_id || 'dins') < 0.8
UNION ALL
SELECT 'INSP-' || vehicle_id, vehicle_id, 'Inspection', 'DEMO-' || vehicle_id,
       DATE '2026-09-25', expiry_date, issuer, 'demo-inspection.pdf', 'Pass'
FROM (VALUES
    ('V0100004', DATE '2026-10-24', 'Bahrain Traffic'),
    ('V0200002', DATE '2027-09-25', 'MVPI'),
    ('V0300002', DATE '2027-09-25', 'Kuwait General Traffic Department'),
    ('V0400007', DATE '2026-10-24', 'Royal Oman Police'),
    ('V0500003', DATE '2026-10-25', 'FAHES'),
    ('V0700002', DATE '2026-10-24', 'RTA')
) t(vehicle_id, expiry_date, issuer);

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
    -- 3% of parts go on back-order: 3-12 extra days the supplier never promised
    CASE WHEN parts_needed AND rnd(jk || 'bo') < 0.03 THEN round(72 + 216 * rnd(jk || 'bod'), 1) ELSE 0 END AS backorder_h,
    CASE WHEN parts_needed
         THEN round((8 + 70 * rnd(jk || 'pw')) * CASE WHEN rn_crisis THEN 2.4 WHEN ist_before THEN 1.4 ELSE 1.0 END, 1)
              + CASE WHEN rnd(jk || 'bo') < 0.03 THEN round(72 + 216 * rnd(jk || 'bod'), 1) ELSE 0 END
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

-- ------------------------------------------------------- issue categories
-- Corrective work gets an issue category typical of its powertrain (earlier list items are more common).
CREATE OR REPLACE TEMP TABLE d_jobs_cat AS
SELECT *, CASE
    WHEN job_type = 'Preventive maintenance' THEN 'Scheduled service'
    WHEN job_type = 'Collision' THEN 'Body & glass'
    WHEN job_type = 'Tyres' THEN 'Tyres & wheels'
    ELSE (CASE powertrain
        WHEN 'BEV'  THEN ['Suspension & steering', 'Software & sensors', 'Electrical (12V)', 'Brakes', 'Climate & cooling', 'Charging system', 'HV battery']
        WHEN 'ICE'  THEN ['Engine & transmission', 'Brakes', 'Suspension & steering', 'Electrical (12V)', 'Climate & cooling', 'Software & sensors', 'Engine & transmission']
        WHEN 'PHEV' THEN ['Engine & transmission', 'Charging system', 'Suspension & steering', 'Electrical (12V)', 'Climate & cooling', 'Software & sensors', 'HV battery']
        ELSE             ['Engine & transmission', 'Brakes', 'Suspension & steering', 'Electrical (12V)', 'Climate & cooling', 'Software & sensors', 'HV battery'] END)
        [1 + CAST(floor(pow(rnd(jk || 'cat'), 1.4) * 7) AS INTEGER)]
END AS issue_category
FROM d_jobs_costed;

-- A job that was not fixed first time comes back 2-12 days later for the same issue: the comeback repair.
-- The repeat flag sits on the comeback (the visit that should not have happened), as in workshop systems.
CREATE OR REPLACE TEMP TABLE d_comebacks AS
SELECT jk || '|cb' AS jk, vehicle_id, site_id, 'Repair' AS job_type,
       opened_at + to_minutes(CAST(round((queue_h + labour_h + parts_wait_h) * 60) AS INTEGER))
                 + to_days(CAST(2 + floor(rnd(jk || 'cbd') * 10) AS INTEGER)) + INTERVAL 2 HOUR AS opened_at,
       round(2 + 10 * rnd(jk || 'cbq'), 1) + round(1.5 + 4 * rnd(jk || 'cbl'), 1)  AS turnaround_h,
       round(1.5 + 4 * rnd(jk || 'cbl'), 1)                                        AS labour_h,
       round((1.5 + 4 * rnd(jk || 'cbl')) * 62 + 60, 2)                            AS total_cost,
       issue_category
FROM d_jobs_cat
WHERE repeat_visit AND job_type IN ('Repair', 'Warranty');

-- --------------------------------------------------- canonical work_orders
CREATE OR REPLACE TEMP TABLE d_wo AS
WITH unioned AS (
    SELECT jk, vehicle_id, site_id, job_type, opened_at,
           queue_h + labour_h + parts_wait_h AS turnaround_h,
           labour_h, parts_wait_h, total_cost, paid_by, FALSE AS repeat_visit, CAST(NULL AS VARCHAR) AS campaign_id, issue_category
    FROM d_jobs_cat
    UNION ALL
    SELECT jk, vehicle_id, site_id, 'Recall', opened_at, turnaround_h, labour_h, 0, total_cost, 'OEM', FALSE, campaign_id, 'Recall campaign'
    FROM d_recall_jobs
    UNION ALL
    SELECT jk, vehicle_id, site_id, job_type, opened_at, turnaround_h, labour_h, 0, total_cost, 'Fleet', TRUE, NULL, issue_category
    FROM d_comebacks WHERE opened_at < TIMESTAMP '2026-10-01'
),
timed AS (
    SELECT *,
        opened_at + to_minutes(CAST(round(turnaround_h * 60) AS INTEGER))                                   AS done_at,
        -- collected 0.5-6h after the vehicle is ready
        opened_at + to_minutes(CAST(round(turnaround_h * 60) + 30 + floor(rnd(jk || 'ko') * 330) AS INTEGER)) AS collected_at,
        -- back earning 0.3-6h after collection; 8% wait 12-30h for a driver or dispatch slot
        CASE WHEN rnd(jk || 'bx') < 0.08 THEN 720 + floor(rnd(jk || 'bi') * 1080)
             ELSE 20 + floor(rnd(jk || 'bi') * 340) END                                                      AS redeploy_min
    FROM unioned
)
SELECT
    'WO' || lpad((row_number() OVER (ORDER BY opened_at, jk))::VARCHAR, 7, '0') AS work_order_id, jk,
    vehicle_id, site_id, job_type, opened_at,
    CASE WHEN done_at < TIMESTAMP '2026-10-01' THEN done_at END                                      AS closed_at,
    labour_h AS labour_hours, parts_wait_h AS parts_wait_hours, total_cost, paid_by, repeat_visit, campaign_id,
    opened_at - to_minutes(CAST(floor(rnd(jk || 'ki') * 120) AS INTEGER))                            AS key_in_at,
    CASE WHEN collected_at < TIMESTAMP '2026-10-01' THEN collected_at END                            AS key_out_at,
    CASE WHEN done_at < TIMESTAMP '2026-10-01' THEN done_at END                                      AS ready_at,
    CASE WHEN collected_at + to_minutes(CAST(redeploy_min AS INTEGER)) < TIMESTAMP '2026-10-01'
         THEN collected_at + to_minutes(CAST(redeploy_min AS INTEGER)) END                           AS back_in_service_at,
    issue_category
FROM timed;

CREATE OR REPLACE TABLE work_orders AS SELECT * EXCLUDE (jk) FROM d_wo;

-- A small, deterministic repair-ready queue for the visual garage: the physical work is done,
-- but collection and administrative closure are still pending. These are fictional demo records.
UPDATE work_orders SET ready_at = TIMESTAMP '2026-09-30 18:00:00'
WHERE work_order_id IN (
    SELECT work_order_id FROM work_orders
    WHERE closed_at IS NULL AND opened_at < TIMESTAMP '2026-09-30 12:00:00'
    ORDER BY work_order_id LIMIT 12
);

-- --------------------------------------------------------------- feedback
-- ~35% of customers answer the post-visit survey. Stars fall with long key-to-key time and repeat visits,
-- so service problems show up in satisfaction too.
CREATE OR REPLACE TABLE feedback AS
WITH j AS (
    SELECT w.*, date_diff('minute', w.key_in_at, w.key_out_at) / 60.0 AS k2k_h
    FROM work_orders w
    WHERE w.key_out_at IS NOT NULL AND w.job_type <> 'Recall'
      AND rnd(w.work_order_id || 'resp') < 0.35
)
SELECT
    'F' || lpad((row_number() OVER (ORDER BY key_out_at, work_order_id))::VARCHAR, 7, '0') AS feedback_id,
    work_order_id, CAST(NULL AS VARCHAR) AS vehicle_id, CAST(NULL AS VARCHAR) AS site_id,
    (key_out_at + to_days(CAST(floor(rnd(work_order_id || 'fd') * 3) AS INTEGER)))::DATE AS date,
    CAST(greatest(1, least(5, round(
        5.15
        - 0.022 * greatest(k2k_h - 18, 0)
        - CASE WHEN repeat_visit THEN 1.4 ELSE 0 END
        - CASE WHEN job_type = 'Collision' THEN 0.3 ELSE 0 END
        - 1.6 * pow(rnd(work_order_id || 'fs'), 2.2)
    ))) AS INTEGER) AS rating,
    CASE WHEN rnd(work_order_id || 'ch') < 0.6 THEN 'SMS' ELSE 'App' END AS channel,
    CAST(NULL AS VARCHAR) AS comment
FROM j
WHERE (key_out_at + to_days(CAST(floor(rnd(work_order_id || 'fd') * 3) AS INTEGER)))::DATE < DATE '2026-10-01';

-- ---------------------------------------------------------------- goodwill
-- Goodwill follows bad experiences: most 1-2 star visits and many comebacks get part of the bill waived.
CREATE OR REPLACE TABLE work_orders AS
SELECT w.*, round(CASE
    WHEN f.rating <= 2 AND rnd(w.work_order_id || 'gw') < 0.65 THEN w.total_cost * (0.30 + 0.30 * rnd(w.work_order_id || 'gwa'))
    WHEN w.repeat_visit AND rnd(w.work_order_id || 'gw') < 0.40 THEN w.total_cost * (0.20 + 0.30 * rnd(w.work_order_id || 'gwa'))
    WHEN rnd(w.work_order_id || 'gw') < 0.01 THEN w.total_cost * 0.15
    ELSE 0 END, 2) AS goodwill_amount
FROM work_orders w
LEFT JOIN feedback f USING (work_order_id);

-- ------------------------------------------------------------ parts orders
-- Every job that waited for parts has an order. Suppliers promise an ETA; some keep it.
-- During the Riyadh North crisis promises were optimistic, so ETA reliability collapses too.
CREATE OR REPLACE TABLE parts_orders AS
WITH p AS (
    SELECT d.work_order_id, j.jk, j.issue_category, j.opened_at, j.parts_wait_h, j.backorder_h, j.rn_crisis,
           ['OEM central warehouse', 'Regional distributor', 'Local aftermarket'][1 + CAST(floor(rnd(j.jk || 'sup') * 3) AS INTEGER)] AS supplier
    FROM d_jobs_cat j JOIN d_wo d USING (jk)
    WHERE j.parts_wait_h > 0
)
SELECT
    'PO' || lpad((row_number() OVER (ORDER BY opened_at, jk))::VARCHAR, 7, '0') AS part_order_id,
    work_order_id, issue_category || ' part' AS part_description, supplier,
    opened_at + INTERVAL 1 HOUR AS ordered_at,
    opened_at + INTERVAL 1 HOUR + to_minutes(CAST(round((parts_wait_h - backorder_h) * 60 * CASE
        WHEN rn_crisis THEN 0.45 + 0.30 * rnd(jk || 'eta')                          -- optimistic promises: ~0% on time
        WHEN supplier = 'Regional distributor' THEN 0.90 + 0.33 * rnd(jk || 'eta')  -- ~70% on time
        WHEN supplier = 'Local aftermarket' THEN 0.97 + 0.30 * rnd(jk || 'eta')     -- ~90% on time
        ELSE 0.95 + 0.35 * rnd(jk || 'eta') END) AS INTEGER)) AS promised_eta,      -- OEM ~86% on time
    CASE WHEN opened_at + INTERVAL 1 HOUR + to_minutes(CAST(round(parts_wait_h * 60) AS INTEGER)) < TIMESTAMP '2026-10-01'
         THEN opened_at + INTERVAL 1 HOUR + to_minutes(CAST(round(parts_wait_h * 60) AS INTEGER)) END AS arrived_at
FROM p;

-- ------------------------------------------------------------------- fines
-- Ride-hail and delivery fleets collect fines; vehicles driving on an expired registration collect one more.
CREATE OR REPLACE TABLE fines AS
WITH slots AS (
    SELECT vehicle_id, region, month_start, in_service_date, days, unnest([1, 2, 3]) AS k FROM d_vm
),
picked AS (
    SELECT *, vehicle_id || '|' || month_start || '|' || k || 'fine' AS fk FROM slots
    WHERE (k = 1 AND rnd(vehicle_id || '|' || month_start || '|' || k || 'fine') < 0.09 * days / 30.0)
       OR (k = 2 AND rnd(vehicle_id || '|' || month_start || '|' || k || 'fine') < 0.025 * days / 30.0)
       OR (k = 3 AND rnd(vehicle_id || '|' || month_start || '|' || k || 'fine') < 0.008 * days / 30.0)
),
typed AS (
    SELECT *, CASE WHEN rnd(fk || 't') < 0.34 THEN 'Speeding' WHEN rnd(fk || 't') < 0.58 THEN 'Parking'
                   WHEN rnd(fk || 't') < 0.78 THEN 'Toll' WHEN rnd(fk || 't') < 0.86 THEN 'Red light'
                   ELSE 'Driving behaviour' END AS fine_type
    FROM picked
),
allf AS (
    SELECT fk, vehicle_id,
           (greatest(month_start, in_service_date) + to_days(CAST(floor(rnd(fk || 'd') * days) AS INTEGER)))::DATE AS fine_date,
           fine_type,
           round(CASE fine_type WHEN 'Speeding' THEN 80 + 220 * rnd(fk || 'a') WHEN 'Parking' THEN 40 + 50 * rnd(fk || 'a')
                                WHEN 'Toll' THEN 30 + 60 * rnd(fk || 'a') WHEN 'Red light' THEN 270 ELSE 110 END
                 * CASE region WHEN 'Türkiye' THEN 0.6 ELSE 1.0 END, 0) AS amount,
           CASE WHEN rnd(fk || 's') < 0.74 THEN 'Paid' WHEN rnd(fk || 's') < 0.95 THEN 'Unpaid' ELSE 'Disputed' END AS status,
           region || ' traffic authority' AS authority
    FROM typed
    UNION ALL
    SELECT vehicle_id || '|regfine', vehicle_id, registration_expiry + 5, 'Expired registration', 140, 'Unpaid',
           region || ' traffic authority'
    FROM vehicles WHERE registration_expiry + 5 < DATE '2026-10-01'
)
SELECT 'FN' || lpad((row_number() OVER (ORDER BY fine_date, fk))::VARCHAR, 7, '0') AS fine_id,
       vehicle_id, fine_date AS date, fine_type, amount, status, authority
FROM allf;

-- ---------------------------------------------------------------- budgets
CREATE OR REPLACE TABLE budgets AS
SELECT d.region, d.month_start AS month, round(sum(d.days / 30.0) * any_value(r.budget_pvm), 0) AS budget
FROM d_vm d JOIN d_regions r USING (region)
GROUP BY ALL;

-- ---------------------------------------------------------------- drivers
-- One named driver per vehicle (invented names), a few with expired or expiring licences.
CREATE OR REPLACE TABLE drivers AS
WITH fl AS (SELECT ['Omar', 'Ahmed', 'Yousef', 'Khalid', 'Faisal', 'Hassan', 'Mehmet', 'Emre', 'Ali', 'Salem', 'Rashid',
                    'Tariq', 'Ibrahim', 'Murat', 'Can', 'Nasser', 'Ravi', 'Arjun', 'Joseph', 'Samir'] AS f),
     ll AS (SELECT ['Haddad', 'Al Mansoori', 'Yilmaz', 'Kaya', 'Al Harthy', 'Rahman', 'Demir', 'Saleh', 'Qureshi', 'Nair',
                    'Al Kuwari', 'Al Shamsi', 'Celik', 'Farouk', 'Menon', 'Aziz'] AS l),
     v AS (SELECT vehicle_id, home_site_id, row_number() OVER (ORDER BY vehicle_id) AS k FROM vehicles)
SELECT 'D' || lpad(k::VARCHAR, 6, '0') AS driver_id,
       f[1 + CAST(floor(rnd(vehicle_id || 'fn') * len(f)) AS INTEGER)] || ' ' || l[1 + CAST(floor(rnd(vehicle_id || 'ln') * len(l)) AS INTEGER)] AS driver_name,
       (1000000 + CAST(floor(rnd(vehicle_id || 'dl') * 8999999) AS BIGINT))::VARCHAR AS licence_number,
       CASE WHEN rnd(vehicle_id || 'cls') < 0.01 THEN 'A' WHEN rnd(vehicle_id || 'cls') < 0.016 THEN NULL ELSE 'B' END AS licence_class,
       CASE WHEN rnd(vehicle_id || 'dle') < 0.008 THEN DATE '2026-10-01' - to_days(CAST(1 + floor(rnd(vehicle_id || 'dld') * 60) AS INTEGER))
            ELSE DATE '2026-10-01' + to_days(CAST(1 + floor(rnd(vehicle_id || 'dld') * 1400) AS INTEGER)) END::DATE AS licence_expiry,
       home_site_id, vehicle_id,
       -- most drivers work; a few are on leave, suspended pending a review, or have left
       CASE WHEN rnd(vehicle_id || 'dst') < 0.022 THEN 'On leave' WHEN rnd(vehicle_id || 'dst') < 0.030 THEN 'Suspended'
            WHEN rnd(vehicle_id || 'dst') < 0.036 THEN 'Inactive' ELSE 'Active' END AS status
FROM v, fl, ll;

-- ------------------------------------------------------------------ trips
-- Weekly telematics summaries for the last 13 weeks. About 8% of drivers speed and brake hard far more often;
-- Riyadh North vehicles idle more but improve week by week, and a coaching drive brings speeding and harsh driving down.
CREATE OR REPLACE TABLE trips AS
WITH weeks AS (SELECT unnest(generate_series(DATE '2026-07-02', DATE '2026-09-24', INTERVAL 7 DAY))::DATE AS wk),
base AS (
    SELECT d.driver_id, d.vehicle_id, v.home_site_id, w.wk, d.driver_id || '|' || w.wk AS tk,
           CASE WHEN rnd(d.driver_id || 'risk') < 0.08 THEN 1 ELSE 0 END AS risky
    FROM drivers d JOIN vehicles v USING (vehicle_id) JOIN weeks w ON v.in_service_date <= w.wk
),
m AS (SELECT *, round(7 * (140 + 120 * rnd(tk || 'km')), 1) AS km, date_diff('week', DATE '2026-07-02', wk) AS wi FROM base)
SELECT 'TR' || lpad((row_number() OVER (ORDER BY wk, vehicle_id))::VARCHAR, 7, '0') AS trip_id,
       vehicle_id, driver_id, wk::TIMESTAMP AS start_ts, (wk + 7)::TIMESTAMP AS end_ts, km,
       round(km / 32 * 60, 0) AS driving_minutes,
       round(km / 32 * 60 * (CASE WHEN home_site_id = 'WS04' THEN 0.30 - 0.012 * wi ELSE 0.08 END + 0.12 * rnd(tk || 'idle')), 0) AS idle_minutes,
       round(95 + 40 * rnd(tk || 'vmax') + 15 * risky, 0) AS max_speed_kmh,
       CAST(round(km / 100 * CASE WHEN risky = 1 THEN 4.5 ELSE 0.5 END * (1.25 - 0.035 * wi) * (0.4 + 1.2 * rnd(tk || 'sp'))) AS INTEGER) AS speeding_events,
       CAST(round(km / 100 * CASE WHEN risky = 1 THEN 4.0 ELSE 0.7 END * (1.15 - 0.02 * wi) * (0.4 + 1.2 * rnd(tk || 'h'))) AS INTEGER) AS harsh_events,
       CASE WHEN rnd(tk || 'geo') < 0.0018 THEN 1 ELSE 0 END AS geofence_exits
FROM m;

-- ------------------------------------------------- tickets on and by drivers
-- Collisions (and some breakdowns) name the driver at the wheel; most repair and tyre jobs are reported by the driver.
CREATE OR REPLACE TABLE work_orders AS
SELECT w.*,
       CASE WHEN w.job_type = 'Collision' OR (w.job_type = 'Repair' AND rnd(w.work_order_id || 'drv') < 0.15) THEN d.driver_id END AS driver_id,
       CASE WHEN w.job_type IN ('Repair', 'Tyres') AND rnd(w.work_order_id || 'rep') < 0.6 THEN d.driver_id
            WHEN w.job_type IN ('Repair', 'Tyres', 'Collision') THEN 'Workshop'
            WHEN w.job_type = 'Preventive maintenance' THEN 'Scheduler' END AS reported_by
FROM work_orders w LEFT JOIN drivers d USING (vehicle_id);



-- ------------------------------------------------- add-ons, warranties and service-centre contacts
-- Equipment beyond the base trim. About a fifth of the electric cars (and a few others) carry a self-driving package.
CREATE OR REPLACE TABLE vehicle_addons AS
WITH cat(addon, category, applies, share, cost, supplier, life_years, software) AS (VALUES
    ('Depot wall charger, 22 kW', 'Charging', 'plug', 0.35, 1800, 'Sahra Energy', 3, NULL),
    ('Vehicle-to-load outlet', 'Charging', 'plug', 0.20, 450, 'Sahra Motors', 2, NULL),
    ('Heat pump', 'Battery & thermal', 'BEV', 0.55, 1200, 'Sahra Motors', 4, NULL),
    ('Battery pre-conditioning pack', 'Battery & thermal', 'BEV', 0.40, 600, 'Sahra Motors', 4, NULL),
    ('Extended-range battery, 82 kWh', 'Battery & thermal', 'BEV', 0.22, 6500, 'Sahra Motors', 8, NULL),
    ('Self-driving computer (HW4)', 'Self-driving', 'sd', 1.00, 3500, 'Sahra Autonomy', 4, 'sw'),
    ('Surround cameras, 8x', 'Self-driving', 'sd', 1.00, 1100, 'Sahra Autonomy', 4, NULL),
    ('Imaging radar', 'Self-driving', 'sd', 0.70, 900, 'Sahra Autonomy', 4, NULL),
    ('Lidar unit', 'Self-driving', 'sd', 0.45, 4200, 'Lumen Sensing', 3, 'fw'),
    ('Driver-monitoring camera', 'Safety', 'all', 0.60, 300, 'Sahra Motors', 2, NULL),
    ('Dashcam, front and cabin', 'Safety', 'all', 0.50, 250, 'Roadeye', 2, NULL),
    ('Telematics unit', 'Telematics', 'all', 0.92, 200, 'Geotab', 3, 'fw'),
    ('Tow bar', 'Body', 'suv', 0.18, 700, 'Sahra Motors', 2, NULL),
    ('Cargo shelving', 'Body', 'van', 0.85, 1500, 'Fleet Fitouts', 2, NULL),
    ('Partition screen', 'Body', 'ridehail', 0.30, 400, 'Fleet Fitouts', 1, NULL)
),
v AS (
    SELECT vehicle_id, powertrain, model, use_case, in_service_date,
           rnd(vehicle_id || 'sd') < CASE powertrain WHEN 'BEV' THEN 0.22 WHEN 'PHEV' THEN 0.08 ELSE 0.03 END AS self_driving
    FROM vehicles
)
SELECT v.vehicle_id, c.addon, c.category,
       (v.in_service_date + to_days(CAST(floor(rnd(v.vehicle_id || c.addon || 'd') * 20) AS INTEGER)))::DATE AS installed_date,
       c.supplier,
       upper(substr(md5(v.vehicle_id || c.addon), 1, 3)) || '-' || lpad(CAST(floor(rnd(v.vehicle_id || c.addon || 's') * 9999999) AS INTEGER)::VARCHAR, 7, '0') AS serial_number,
       CASE c.software WHEN 'sw' THEN 'SD ' || (12 + CAST(floor(rnd(v.vehicle_id || 'swv') * 3) AS INTEGER)) || '.' || CAST(floor(rnd(v.vehicle_id || 'swm') * 6) AS INTEGER)
                       WHEN 'fw' THEN 'FW ' || (3 + CAST(floor(rnd(v.vehicle_id || c.addon || 'f') * 2) AS INTEGER)) || '.' || CAST(floor(rnd(v.vehicle_id || c.addon || 'g') * 9) AS INTEGER) END AS software_version,
       round(c.cost * (0.9 + 0.2 * rnd(v.vehicle_id || c.addon || 'c')), -1) AS cost,
       (v.in_service_date + to_years(c.life_years))::DATE AS warranty_end
FROM v CROSS JOIN cat c
WHERE CASE c.applies
        WHEN 'plug' THEN v.powertrain IN ('BEV', 'PHEV') WHEN 'BEV' THEN v.powertrain = 'BEV' WHEN 'sd' THEN v.self_driving
        WHEN 'suv' THEN v.model LIKE '%SUV%' WHEN 'van' THEN v.model LIKE '%Van%' WHEN 'ridehail' THEN v.use_case = 'Ride-hail'
        ELSE TRUE END
  AND rnd(v.vehicle_id || c.addon) < c.share;

-- The maker's warranties run from the in-service date: basic 3 years / 100,000 km, powertrain 5 / 150,000,
-- the high-voltage battery 8 / 160,000 on electrified cars, self-driving hardware 4 / 120,000; 30% bought an extended plan.
CREATE OR REPLACE TABLE warranties AS
WITH cov(coverage, years, km_limit, applies) AS (VALUES
    ('Basic (bumper to bumper)', 3, 100000, 'all'), ('Powertrain', 5, 150000, 'all'),
    ('HV battery and drive unit', 8, 160000, 'ev'), ('Corrosion', 8, NULL, 'all'),
    ('Self-driving hardware', 4, 120000, 'sd'), ('Extended service plan', 6, 200000, 'ext')
),
sd AS (SELECT DISTINCT vehicle_id FROM vehicle_addons WHERE category = 'Self-driving')
SELECT v.vehicle_id, c.coverage,
       CASE WHEN c.coverage = 'Extended service plan' THEN 'Sahra Care' ELSE 'Sahra Motors' END AS provider,
       v.in_service_date AS start_date, (v.in_service_date + to_years(c.years))::DATE AS end_date,
       CAST(c.km_limit AS DOUBLE) AS km_limit,
       'W-' || strftime(v.in_service_date, '%Y') || '-' || substr(v.vehicle_id, 2) || '-' || upper(substr(c.coverage, 1, 2)) AS contract_number,
       CASE WHEN rnd(v.vehicle_id || c.coverage || 'void') < 0.004 THEN 'Void' ELSE 'Active' END AS status
FROM vehicles v CROSS JOIN cov c LEFT JOIN sd USING (vehicle_id)
WHERE CASE c.applies WHEN 'ev' THEN v.powertrain IN ('BEV', 'PHEV', 'HEV') WHEN 'sd' THEN sd.vehicle_id IS NOT NULL
                     WHEN 'ext' THEN rnd(v.vehicle_id || 'ext') < 0.3 ELSE TRUE END;

-- One manufacturer service centre per region, with a named contact for each desk.
-- Phone numbers use the 555 range and e-mails the reserved .example domain: they are fictional.
CREATE OR REPLACE TABLE service_contacts AS
WITH r(region, city, cc, area) AS (VALUES ('UAE', 'Dubai', '+971', '4'), ('KSA', 'Riyadh', '+966', '11'), ('Qatar', 'Doha', '+974', '44'),
        ('Kuwait', 'Kuwait City', '+965', '22'), ('Bahrain', 'Manama', '+973', '17'), ('Oman', 'Muscat', '+968', '24'), ('Türkiye', 'Istanbul', '+90', '212')),
     roles(role, k, hours) AS (VALUES ('Service advisor', 1, 'Sun-Thu 7:30-19:00, Sat 9:00-14:00'), ('Warranty desk', 2, 'Sun-Thu 8:00-17:00'),
        ('EV and high-voltage specialist', 3, 'Sun-Thu 8:00-17:00'), ('Self-driving calibration', 4, 'By appointment'),
        ('Parts desk', 5, 'Sun-Thu 7:30-18:00'), ('Roadside assistance', 6, '24/7')),
     fl AS (SELECT ['Layla', 'Omar', 'Nadia', 'Karim', 'Sara', 'Yusuf', 'Huda', 'Elif', 'Rami', 'Mona', 'Burak', 'Aisha'] AS f),
     ll AS (SELECT ['Haddad', 'Al Mansoori', 'Yilmaz', 'Kaya', 'Al Harthy', 'Rahman', 'Saleh', 'Nair', 'Al Kuwari', 'Aziz'] AS l)
SELECT 'SC' || lpad(row_number() OVER (ORDER BY r.region, roles.k)::VARCHAR, 4, '0') AS contact_id, 'Sahra' AS make,
       'Sahra Service Centre ' || r.city AS service_centre, r.region, roles.role,
       CASE WHEN roles.role = 'Roadside assistance' THEN 'Sahra Assist (24/7 line)'
            ELSE f[1 + CAST(floor(rnd(r.region || roles.role || 'f') * len(f)) AS INTEGER)] || ' ' || l[1 + CAST(floor(rnd(r.region || roles.role || 'l') * len(l)) AS INTEGER)] END AS name,
       r.cc || ' ' || r.area || ' 555 0' || lpad((100 + roles.k * 7 + CAST(floor(rnd(r.region) * 80) AS INTEGER))::VARCHAR, 3, '0') AS phone,
       lower(replace(split_part(roles.role, ' ', 1), '-', '')) || '.' || lower(replace(r.city, ' ', '')) || '@service.sahra.example' AS email,
       roles.hours
FROM r CROSS JOIN roles, fl, ll;
