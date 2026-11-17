# Changelog

What changed in each version of FleetOps KPI. Dates are release dates; the newest version is at the top.

## Unreleased

- Security: restrict document previews, escape procedure Markdown, render tooltips on canvas, isolate offline caches, harden calendar and spreadsheet exports, and audit dependencies in CI.
- Reliability: serialise browser pipeline builds, wait for committed local writes, tolerate integer overflow during ingestion, and handle missing or degenerate metric evidence.
- Operations: live SOP queue with scoped checklists, owners, deadlines, evidence notes and downloadable handoffs. Metric search, keyboard selection, focused connections and bounded simulations.
- Design: revised light/dark palette, readable operational surfaces, navigation semantics and mobile graph access.

- **Licence:** from this version on, FleetOps is released under the
  [Functional Source License 1.1, MIT future licence](LICENSE.md). Free for your own fleet, research, teaching and
  client work; not for resale as a competing product. Each release becomes MIT two years after it is published.
  Versions up to 0.5.0 stay MIT.
- Sample files in [`samples/`](samples) to try the app in under a minute.
- Issue templates, contributing guide, changelog.

## 0.5.0: works offline (2026-11-17)

- **Installable app:** the web app installs from the browser and keeps working with no connection; the document
  reader (OCR) can be kept offline on request.
- **Downloadable package:** `FleetOps-offline-0.5.0.zip` on [Releases](https://github.com/Pemalahmad/FleetOps-KPI-Dashboard/releases),
  with launchers for macOS, Windows and Linux that serve the app on this computer only, and a SHA-256 checksum.
- **Plan & offline page** and an open licence gate: every feature unlocked during early access; licence keys are
  signed with Ed25519 and checked offline (`fleetkpi license issue`).
- **Renewal reminders** as a calendar file (alerts 30 and 7 days before each expiry).
- **Excel export** of the fleet register, protected against formula injection.
- **Security:** Content Security Policy, [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), CodeQL and Dependabot.
- Feature map against Fleetio, Samsara, Motive, Geotab and Verizon Connect in
  [docs/FLEET_SOFTWARE.md](docs/FLEET_SOFTWARE.md).

## 0.4.x: fleet software for owners (2026-11-17)

- **Import any fleet workbook:** every sheet, title rows skipped, Excel dates read, tables and columns recognised
  (including exports from the common fleet platforms), mapping saved in the browser.
- **Document scanning:** registration cards, insurance, inspections and permits read in the browser (English and
  Arabic OCR, PDF text), matched to vehicles by VIN, plate or fleet number.
- **Fleet register:** identity, licence status and one next action per vehicle; VIN check digit and offline decoding,
  optional NHTSA vPIC decode.
- Registry mode: a vehicle list alone is enough; work orders unlock the operating KPIs.

## 0.4.0: the browser app and the metric network (2026-11-17)

- **TypeScript / Next.js app** with the SQL pipeline running in the browser on DuckDB-WASM, deployed to
  [GitHub Pages](https://pemalahmad.github.io/FleetOps-KPI-Dashboard/).
- **Metric network:** every KPI linked by exact identities and measured drivers (regression with standard errors,
  p-values, confidence intervals), a what-if simulator and job-level evidence.
- **The Three Clocks Doctrine** and eight SOPs; new KPIs: repeat repairs, time to pick up, back to operations, parts
  ETA, fines, goodwill, service spend, CSAT, key-to-key, backlog, productivity, depreciation, compliance.

## 0.3.0: dbt-style SQL pipeline (2026-11-17)

- SQL models, validation rules and data tests run in dependency order; chart-first light and dark UI.

## 0.2.0: plug-and-play (2026-11-17)

- Bring your own files with column mapping; electric, hybrid and combustion fleets.

## 0.1.0: first version (2026-11-17)

- Fleet and service operations KPIs on a SQL warehouse with checks and a local dashboard.

