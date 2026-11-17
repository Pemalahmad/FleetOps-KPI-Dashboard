---
id: SOP-01
title: Data onboarding & monthly refresh
owner: Fleet data analyst
cadence: Once at setup, then monthly (first working day)
trigger: New fleet onboarded, or a new month of data available
page: Pipeline
---

## Purpose
Get a fleet's own records into the warehouse correctly, and keep them fresh, so every KPI downstream can be trusted.

## Steps
- [ ] Export the tables available from the fleet register, workshop / DMS, telematics, fuel and charging systems. The Python operations pipeline requires sites, vehicles, work_orders and usage; the browser can start with a vehicle list in registry mode.
- [ ] Compare each export with `DATA_CONTRACT.md` and the files in `templates/`. Keep your own column names.
- [ ] Review table and column mappings on **Import** before adding files. For the Python pipeline, set unknown columns in `fleet.yml` under `mapping:` and in-house codes under `value_maps:`.
- [ ] Inspect **Pipeline & your data**, or run `fleetkpi validate`. Fix every **error** at the source system, then import a corrected export.
- [ ] Review the **warnings** on the Pipeline page and decide: fix, or accept and note why.
- [ ] Rebuild the browser report, or run `fleetkpi build`, and confirm every executed stage passes. Registry mode does not provide complete operational evidence.
- [ ] Spot-check three numbers against the source system: active fleet size, last month's job count, last month's maintenance spend.
- [ ] Record the refresh date and anything accepted in the change log.

## Exit criteria
Pipeline fully green; the three spot checks reconcile within 1%.

## Escalation
A required table that cannot be exported goes to the system owner within 2 working days.

