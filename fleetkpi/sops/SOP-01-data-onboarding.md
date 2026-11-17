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
- [ ] Export the eight tables from your systems (fleet register, workshop / DMS, telematics, fuel & charging cards). Four are required: sites, vehicles, work_orders, usage.
- [ ] Compare each export with `DATA_CONTRACT.md` and the files in `templates/`. Keep your own column names.
- [ ] Map any column the tool does not recognise in `fleet.yml` under `mapping:`; translate in-house codes under `value_maps:`.
- [ ] Run `fleetkpi validate`. Fix every **error** at the source system, not in the export.
- [ ] Review the **warnings** on the Pipeline page and decide: fix, or accept and note why.
- [ ] Run `fleetkpi build` and confirm all six pipeline stages are green.
- [ ] Spot-check three numbers against the source system: active fleet size, last month's job count, last month's maintenance spend.
- [ ] Record the refresh date and anything accepted in the change log.

## Exit criteria
Pipeline fully green; the three spot checks reconcile within 1%.

## Escalation
A required table that cannot be exported goes to the system owner within 2 working days.
