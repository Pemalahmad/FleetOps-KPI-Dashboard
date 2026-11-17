-- description: VIN decoding without any external service: format, check digit, model year and manufacturer (WMI)

-- Transliteration value of one VIN character (ISO 3779 / 49 CFR 565): letters map to 1-9, I O Q are never used.
CREATE OR REPLACE MACRO vin_val(c) AS
    CASE WHEN c BETWEEN '0' AND '9' THEN c::INTEGER
         ELSE [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 7, 9, 2, 3, 4, 5, 6, 7, 8, 9][strpos('ABCDEFGHJKLMNPRSTUVWXYZ', c)] END;

-- Weighted sum mod 11; 10 is written 'X'. Weights 8 7 6 5 4 3 2 10 0 9 8 7 6 5 4 3 2.
CREATE OR REPLACE MACRO vin_check_digit(v) AS (
    vin_val(substr(v, 1, 1)) * 8 + vin_val(substr(v, 2, 1)) * 7 + vin_val(substr(v, 3, 1)) * 6
  + vin_val(substr(v, 4, 1)) * 5 + vin_val(substr(v, 5, 1)) * 4 + vin_val(substr(v, 6, 1)) * 3
  + vin_val(substr(v, 7, 1)) * 2 + vin_val(substr(v, 8, 1)) * 10
  + vin_val(substr(v, 10, 1)) * 9 + vin_val(substr(v, 11, 1)) * 8 + vin_val(substr(v, 12, 1)) * 7
  + vin_val(substr(v, 13, 1)) * 6 + vin_val(substr(v, 14, 1)) * 5 + vin_val(substr(v, 15, 1)) * 4
  + vin_val(substr(v, 16, 1)) * 3 + vin_val(substr(v, 17, 1)) * 2) % 11;

-- Valid | Invalid format | Check digit mismatch | Missing. The check digit is mandatory only for North American
-- VINs (first character 1-5); elsewhere it is informational, so it is not held against the VIN.
CREATE OR REPLACE MACRO vin_status(v) AS
    CASE WHEN v IS NULL OR v = '' THEN 'Missing'
         WHEN NOT regexp_full_match(v, '[A-HJ-NPR-Z0-9]{17}') THEN 'Invalid format'
         WHEN substr(v, 1, 1) IN ('1', '2', '3', '4', '5')
              AND substr(v, 9, 1) <> CASE WHEN vin_check_digit(v) = 10 THEN 'X' ELSE vin_check_digit(v)::VARCHAR END
              THEN 'Check digit mismatch'
         ELSE 'Valid' END;

-- Model year from the 10th character. The code repeats every 30 years (A = 1980, 2010, 2040); the latest
-- year not after next year is taken.
CREATE OR REPLACE MACRO vin_model_year(v, as_of) AS
    CASE WHEN regexp_full_match(coalesce(v, ''), '[A-HJ-NPR-Z0-9]{17}')
              AND strpos('ABCDEFGHJKLMNPRSTVWXY123456789', substr(v, 10, 1)) > 0
         THEN 1980 + (strpos('ABCDEFGHJKLMNPRSTVWXY123456789', substr(v, 10, 1)) - 1)
              + 30 * CAST(floor((year(as_of) + 1 - 1980 - (strpos('ABCDEFGHJKLMNPRSTVWXY123456789', substr(v, 10, 1)) - 1)) / 30.0) AS INTEGER)
         END;

-- World Manufacturer Identifiers (first three characters) for makes common in fleets. Extend freely.
CREATE OR REPLACE TABLE ref_wmi AS SELECT * FROM (VALUES
    ('5YJ', 'Tesla'), ('7SA', 'Tesla'), ('LRW', 'Tesla'), ('XP7', 'Tesla'), ('SFZ', 'Tesla'),
    ('LGX', 'BYD'), ('LC0', 'BYD'),
    ('JTD', 'Toyota'), ('JTN', 'Toyota'), ('JTE', 'Toyota'), ('JTM', 'Toyota'), ('JTH', 'Lexus'), ('MR0', 'Toyota'),
    ('MR2', 'Toyota'), ('MHF', 'Toyota'), ('4T1', 'Toyota'), ('5TD', 'Toyota'), ('NMT', 'Toyota'), ('SB1', 'Toyota'),
    ('JN1', 'Nissan'), ('JN8', 'Nissan'), ('SJN', 'Nissan'), ('1N4', 'Nissan'), ('5N1', 'Nissan'),
    ('KMH', 'Hyundai'), ('KM8', 'Hyundai'), ('5NP', 'Hyundai'), ('TMA', 'Hyundai'), ('KNA', 'Kia'), ('KND', 'Kia'),
    ('KNM', 'Kia'), ('5XY', 'Kia'), ('U5Y', 'Kia'),
    ('WVW', 'Volkswagen'), ('WV1', 'Volkswagen'), ('WV2', 'Volkswagen'), ('WVG', 'Volkswagen'), ('3VW', 'Volkswagen'),
    ('WAU', 'Audi'), ('WA1', 'Audi'), ('TRU', 'Audi'), ('WBA', 'BMW'), ('WBS', 'BMW'), ('WBY', 'BMW'), ('5UX', 'BMW'),
    ('WDD', 'Mercedes-Benz'), ('W1K', 'Mercedes-Benz'), ('W1N', 'Mercedes-Benz'), ('WDB', 'Mercedes-Benz'),
    ('W1V', 'Mercedes-Benz'), ('WDF', 'Mercedes-Benz'), ('WP0', 'Porsche'), ('WP1', 'Porsche'),
    ('YV1', 'Volvo'), ('YV4', 'Volvo'), ('LYV', 'Volvo'), ('YSM', 'Polestar'), ('LPS', 'Polestar'),
    ('1FA', 'Ford'), ('1FM', 'Ford'), ('1FT', 'Ford'), ('3FM', 'Ford'), ('WF0', 'Ford'), ('MAJ', 'Ford'), ('NM0', 'Ford'),
    ('1G1', 'Chevrolet'), ('1GC', 'Chevrolet'), ('3GN', 'Chevrolet'), ('KL1', 'Chevrolet'), ('1GT', 'GMC'),
    ('1GY', 'Cadillac'), ('1C4', 'Jeep'), ('1C6', 'Ram'), ('2C3', 'Chrysler'),
    ('JHM', 'Honda'), ('SHH', 'Honda'), ('1HG', 'Honda'), ('5FN', 'Honda'), ('JM1', 'Mazda'), ('JMZ', 'Mazda'),
    ('JF1', 'Subaru'), ('JA3', 'Mitsubishi'), ('JA4', 'Mitsubishi'), ('MMB', 'Mitsubishi'), ('JS2', 'Suzuki'),
    ('MA3', 'Suzuki'), ('VF1', 'Renault'), ('VF3', 'Peugeot'), ('VF7', 'Citroën'), ('ZFA', 'Fiat'), ('VSS', 'SEAT'),
    ('TMB', 'Škoda'), ('SAL', 'Land Rover'), ('SAJ', 'Jaguar'), ('SCC', 'Lotus'),
    ('LSJ', 'MG'), ('LVV', 'Chery'), ('LVT', 'Chery'), ('LB3', 'Geely'), ('L6T', 'Geely'), ('LJ1', 'JAC'),
    ('LGW', 'Great Wall'), ('LVG', 'GAC'), ('LMG', 'GAC'), ('LDC', 'Dongfeng'), ('LZW', 'SAIC-GM-Wuling'),
    ('LNB', 'BAIC'), ('LFV', 'FAW-Volkswagen'), ('LRB', 'Buick'), ('LVS', 'Ford (Changan)'), ('LS5', 'Changan'),
    ('LUR', 'Zeekr'), ('L1N', 'XPeng'), ('LRE', 'NIO'), ('HJR', 'Hongqi'), ('LGB', 'Dongfeng Nissan'),
    ('7FC', 'Rivian'), ('50E', 'Lucid'), ('7G2', 'Lucid'), ('JTJ', 'Lexus'), ('2T1', 'Toyota'), ('5LM', 'Lincoln'),
    ('MAL', 'Hyundai'), ('MAT', 'Tata'), ('MA1', 'Mahindra'), ('XTA', 'Lada'), ('NLA', 'Honda (Türkiye)'),
    ('NLH', 'Hyundai (Türkiye)'), ('NM4', 'Ford Otosan'), ('VR7', 'Citroën'), ('VR3', 'Peugeot'),
    ('SHR', 'Sahra (demo)')
) AS t(wmi, make);
