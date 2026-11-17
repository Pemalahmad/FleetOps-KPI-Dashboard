# fleetkpi: plug-and-play fleet operations KPIs

**Drop in your fleet's own files — electric, hybrid or combustion — and get a tested SQL warehouse and a live, gamified operations cockpit in light and dark, with the full pipeline and the SOP behind every flag.**

![CI](https://github.com/Pemalahmad/fleet-ops-kpi-dashboard/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![SQL](https://img.shields.io/badge/SQL-DuckDB-FFF000?logo=duckdb&logoColor=black)
![Models](https://img.shields.io/badge/SQL_models-41-6366F1)
![Tests](https://img.shields.io/badge/SQL_tests-15-10B981)
![License](https://img.shields.io/badge/license-MIT-green)

```bash
pip install git+https://github.com/Pemalahmad/fleet-ops-kpi-dashboard
fleetkpi demo my-fleet && cd my-fleet && fleetkpi serve       # 6,500-vehicle demo, built in ~1.5 s
```

| Light | Dark |
|---|---|
| ![Overview, light](docs/overview-light.jpg) | ![Customer, dark](docs/customer-dark.jpg) |

---

## The KPIs

| Area | KPI | Definition |
|---|---|---|
| **Customer** | Customer satisfaction (CSAT) | Share of 4-5 star ratings |
| | 1-2 star ratings | Count and share of 1-2 star ratings, by region and site |
| | Average rating | Mean stars, with the full 1-5 distribution |
| | Key-to-key | Median hours from key handed in to key handed back (p50 and p90, % within target) |
| **Workshop** | Days of backlog | Open jobs ÷ average daily completions over the last 28 days, plus aging buckets (< 1, 1-3, 3-7, 7+ days) |
| | Technician productivity | Billed labour hours ÷ available productive technician hours |
| | Turnaround & INTERVENE | Weekly median turnaround per site vs the network and its own trend |
| | First-time fix | Share of jobs with no repeat visit |
| **Fleet & assets** | Availability / utilisation | Vehicle-hours on the road; operating hours vs plan |
| | Time in service | Days since entering service, age bands by powertrain |
| | Depreciation & book value | Straight-line or declining-balance to a residual value; book value, monthly depreciation, value retained |
| | Cost per km & TCO | Energy + fleet-paid maintenance + depreciation, by powertrain; L/100 km, kWh/100 km, CO₂ g/km |
| **Compliance** | Registration status | Valid / Expiring (inside the renewal window) / Expired / Unknown, valid %, renewal calendar |
| | Insurance status | Same, by insurer |
| | Preventive maintenance | Inside the km-or-months interval for each powertrain |
| | Recalls | Completion % and curve per campaign and region |
| | Cost vs budget | Fleet-paid maintenance vs budget, by region and month |

Every KPI has a green/amber/red target in `fleet.yml`. The gamified **Ops Score** (0-1,000, Platinum/Gold/Silver/Bronze, streaks, badges) is built only from these KPIs: key-to-key, first-time fix, CSAT, productivity and PM compliance.

## The pipeline: SQL first, dbt-style

```mermaid
flowchart LR
    F["Your files<br/>CSV · Excel · Parquet"] --> I["1 Ingest"] --> S["2 Standardise"] --> V["3 Validate<br/>24 SQL rules"]
    V -- errors --> X["Blocked: last good<br/>warehouse kept"]
    V --> ST["4 Staging<br/>7 models"] --> IN["5 Intermediate<br/>8 models"] --> M["6 Marts<br/>26 models"] --> T["7 Test<br/>15 SQL tests"] --> P["8 Publish<br/>atomic swap"]
```

```
fleetkpi/sql/
├── macros/          rag(), book_value(), doc_status(), price and CO₂ lookups
├── validation/      v01…v24  raw-data rules: a SELECT returning offending ids (0 rows = pass)
├── models/
│   ├── staging/     stg_*   one clean, typed model per input table
│   ├── intermediate/int_*   vehicle-months, downtime, PM status, weekly site performance, productivity
│   └── marts/       mart_*  every KPI the dashboard reads
└── tests/           t01…t15  data tests on the models (grain, ranges, reconciliation)
```

- **One model per file, as a plain `SELECT`.** The runner (`fleetkpi/sqlrunner.py`) reads the `FROM`/`JOIN`s to find dependencies, sorts the models, refuses a model that depends on a later layer, materialises each one as a view or table, and records rows, timing and lineage.
- **Validation and tests are SQL too.** `validation/` checks your raw data (duplicates, orphans, impossible dates, ratings outside 1-5…); `tests/` checks the models (one row per vehicle per month, book value between residual and cost, cost reconciles to work orders…).
- **Everything is logged into the warehouse.** `pipeline_runs`, `pipeline_models`, `pipeline_tests`, `validation_issues` and `ingest_log` drive the Pipeline page: stage cards, a lineage graph drawn from the real dependencies, model and test SQL, and a *Run pipeline* button.

![Pipeline](docs/pipeline-dark.jpg)

## Plug and play, for any powertrain

| | |
|---|---|
| **Your files, your column names** | CSV, Excel, Parquet or JSON. 240 column synonyms are recognised (`Plate No` → `vehicle_id`, `Date In` → `opened_at`, `Mulkiya Expiry` → `registration_expiry`); map anything else once in `fleet.yml`. |
| **Your codes, normalised** | `Electric`, `EV`, `Plug-in Hybrid`, `Petrol`, `Diesel` → BEV / PHEV / HEV / ICE (diesel kept for CO₂). `Oil service`, `Breakdown`, `Accident repair` → standard job types. `dd/mm/yyyy` dates and `1,250.00` amounts just work. |
| **Four tables required, five optional** | `sites`, `vehicles`, `work_orders`, `usage` are required; add `energy`, `feedback`, `recalls`, `recall_vehicles`, `budgets` when you have them. Missing tables hide their sections; nothing breaks. |
| **One settings file** | Currency, operating and productive hours, prices and CO₂ factors by region, PM intervals per powertrain, depreciation method and residual, renewal window, targets, scoring weights. |

```bash
fleetkpi init my-fleet    # fleet.yml + 9 CSV templates + DATA_CONTRACT.md
fleetkpi validate         # what is wrong with my data, in plain language
fleetkpi build            # run the eight stages
fleetkpi serve            # open the dashboard (light / dark / system)

docker build -t fleetkpi . && docker run -p 8501:8501 -v "$PWD/my-fleet:/fleet" fleetkpi
```

## The dashboard

Seven pages, all charts: KPI tiles with sparklines and deltas, gauges against target bands, donuts you can click to filter, radar profiles, heatmaps, a renewal calendar and a region × KPI scorecard matrix. A global region filter applies everywhere. **Light, dark or follow the system:** ⋮ menu → System · Light · Dark. Custom elements are tinted from the current text colour, so they switch with the theme instantly.

| | |
|---|---|
| ![Workshop](docs/workshop-dark.jpg) | ![Fleet & assets](docs/fleet-assets-dark.jpg) |
| ![Compliance](docs/compliance-dark.jpg) | ![Weekly heatmap](docs/heatmap-light.jpg) |

**Eight SOPs** (data onboarding, weekly review, site intervention, recalls, PM compliance, month-end cost, **registration & insurance renewal**, **customer recovery for 1-2 star ratings**) carry an owner, cadence, trigger and checklist, and go *Active* automatically when the data trips their trigger.

## The demo fleet

*Sahra Mobility* is **fictional**: 6,500 vehicles (45% BEV, 25% HEV, 10% PHEV, 20% ICE), 15 workshops, 7 markets, 18 months. It is generated in SQL with customer ratings, key-in and key-out times, and registration and insurance dates, exported as ordinary contract files, and loaded back through the same eight stages as anyone's data. Its operating stories are tested: the **Riyadh North** parts-and-attrition crisis is flagged INTERVENE for 18 weeks, pushes KSA's 1-2 star share up, and recovers. All figures come from synthetic inputs and illustrate the method; they are not benchmarks.

## Quality

- **15 SQL data tests** and **24 SQL validation rules** run inside every build.
- **14 Python tests** (`pytest`): the demo end to end; a foreign-format fleet (Excel, its own column names, `dd/mm` dates, monthly usage, no optional tables) that must plug in with mapping only; bad data blocked with the right reasons; dependency order and layer rules.
- **CI** on Python 3.10 and 3.12, plus a Docker build that runs the demo inside the image.

---

Built by [Mohammad Alahmad](https://linkedin.com/in/pemalahmad) with Claude Code. The structure mirrors how I ran operations analytics for a multi-market EV network; the demo company and its data are invented. MIT licensed.
