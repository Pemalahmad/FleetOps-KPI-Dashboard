# Changelog

What changed in each version of FleetOps KPI. Dates are release dates; the newest version is at the top.

## Unreleased

### Swarm cursor (2026-11-18)
- Analytics: a particle swarm (React Bits SwarmCursor) follows the pointer and gathers around the KPI, live number or button under it; a fixed, click-through layer with an on/off switch remembered in this browser. Off for reduced motion and on machines without a graphics card.
- Count-up numbers now expose their final value to screen readers.

### Live dashboards (2026-11-18)
- LIVE badge in the top bar and live panels on the Garage, Analytics and Drivers pages: ticking numbers, a streaming chart and an incoming event feed; pause and resume.
- Demo: a simulated feed from the demo fleet (trips, workshop check-ins, ready jobs, handovers, charging and refuelling, fines, alerts), labelled as simulated; 3D garage cars drive out and back on trips and handovers.
- Your fleet: Follow a file on Import re-imports a changing export with the confirmed mapping and rebuilds the dashboards (File System Access API, Chrome and Edge).

### More motion (2026-11-18)
- Four more React Bits components: ShinyText (headline sweep), GlareHover (garage zones, car shapes), LogoLoop (supported exports on Import), Magnet (main buttons).
- Numbers count up as they scroll into view; charts grow in with a stagger; sparklines and work-tree connectors draw themselves; work-tree nodes appear in sequence; cars drive into their garage bays; pages fade in on navigation; press feedback on buttons and chips. All off with reduced motion.

### Driver KPIs and charts (2026-11-18)
- Drivers page: 25 KPIs in four groups (compliance, safety, fines and tickets, activity) with weekly trend lines and change on the week before.
- New charts: driving behaviour by week, tickets on and by drivers by month, compliance by region, licence expiries over the next 12 months, fines on drivers by type, driver safety by site.
- Demo trips now tell a story: a coaching drive lowers speeding and harsh driving over the quarter, and Riyadh North's idling improves week by week.

### React Bits effects (2026-11-18)
- Interactive dot field behind the garage, analytics, drivers and pipeline headers; a pointer spotlight on every card; click sparks in the garage. Three components from React Bits (MIT + Commons Clause), kept in `web/src/components/bits/` with their licence, listed in the third-party notices and the EULA; no new npm packages.

### Driver compliance (2026-11-18)
- Driver compliance status with reasons: licence class against the class the assigned vehicle needs (B, C, CE, D; worked out from the model or set with `licence_class_required`), licence validity, unpaid fines over a limit.
- Fines are matched to a driver (named on the fine, else on a trip that day, else the assigned driver); work orders can name the driver involved (`driver_id`) and who reported them (`reported_by`).
- New mart `mart_driver_compliance`, test t27, alert rules for a wrong licence class and unpaid fines (`alerts.unpaid_fines_amount`).
- Drivers page: compliance columns, a driver profile (licence, driving, fines, tickets) and new headline numbers; Analytics adds "Drivers not compliant".

### Drivers, trips, alert rules and an activity log (2026-11-18)
- New optional tables in the data contract: `drivers` (licence class and expiry, assigned vehicle) and `trips` (telematics trip or period summaries).
- New SQL models `stg_drivers`, `stg_trips`, `mart_driver_scores` (0-100 safety score) and `mart_alerts` (rules engine: speeding, harsh driving, idling, zone exits, expired or expiring licences), with tests t25-t26 and rules v43-v44; limits under `alerts:` in fleet.yml.
- New Drivers & trips page and a Drivers & trips group in Analytics; the demo fleet has a driver per vehicle and 13 weeks of trips.
- Activity log: every change the owner makes is recorded, sealed with the workspace, and shown on Plan & offline.
- README: the architecture of a classic fleet system mapped to FleetOps' local-first design.

### Garage, register and analytics design (2026-11-18)
- Seven more KPIs in Analytics (37 in all): fleet health score, planned maintenance share, days between unplanned visits, under-used vehicles, fuel litres per 100 km, electricity kWh per 100 km and unusual fuel months.
- Heavy vehicles in the garage: cab-over box trucks and tractor units (fifth wheel, exhaust stacks, fuel tanks, tandem rear axle); Actros, FH, Scania R and TGX models are recognised as tractors.
- New visual language across every page: content inside a framed column with hairline section rules, small monospace section labels, headlines whose second half sits in a quieter tone, flatter panels, and panels that rise into place as you scroll (CSS only, off with reduced motion).
- Pipeline page: a live work tree of how your files become the pages you use (sources → checks → SQL models → tests → garage, register, analytics, network) with this run's counts, animated connectors and clickable outputs.
- Car bodies are now lofted from cross-sections: curved sides, rounded nose and tail, a cabin that narrows to the roof, real wheel arches, set-in windscreen and side glass, five-spoke alloys, corner headlights, grille and a full-width tail-light bar.
- Garage cars now look like real vehicles: sedan, hatchback, SUV, pickup (open bed), van, minibus and box truck
  bodies with rounded panels, glass, wheels, mirrors and lights, painted in each vehicle's registered colour; the
  stage shows as a coloured pad under the car. Zoom buttons for a closer look.
- Fleet register: "Car shapes in the garage" lists every make and model with a side-view preview. The shape is picked
  from the model name (Hilux → pickup, Hiace → van, Land Cruiser → SUV…) and the owner can change it; choices are
  saved in the encrypted workspace.
- The garage floor is now a 3D scene: six work zones on one slab, cars coloured by queue, flashing beacons and cones on
  accident holds, lifts in the repair bays. Drag to turn it, click a car to open it. Built with three.js, bundled and
  loaded on demand; the zone list below stays the keyboard and screen-reader route.
- Crew rank with an XP bar to the next rank, five badges, and recovery missions with progress bars. XP never clears a
  safety or document gate.
- Fleet register: one compact strip of headline numbers (now with electrified share), and the make → model → trim
  sunburst replaced by one bar per model split by trim, with names tidied (spacing, one-case names, repeated make).
- Analytics: redesigned KPI tiles (target state, change, trend) and a new "Every KPI" section with 30 indicators in
  five groups, adding utilisation, first-time fix, PM compliance, backlog days, aged open jobs, registration and
  insurance validity, total cost per km and CO₂ per km for the network or the selected region.

### Security and legal (2026-11-18)
- SOP review notes, owners and due dates are saved in the encrypted workspace instead of plain localStorage; older
  notes are migrated and deleted. Notes typed while a report rebuilds are no longer lost.
- Clickjacking guard for hosts that cannot send `frame-ancestors`.
- Property-based fuzz tests for every untrusted-input parser and for encryption round-trips.
- Hash-locked Python installs in CI and Docker, Docker base image pinned by digest and run as non-root, least-privilege
  workflow permissions, CodeQL tag-filter fix.
- Privacy Policy rewritten as a formal policy; new EULA and Copyright/DMCA policy, shown in the app at /legal/ and
  shipped in the offline package with THIRD_PARTY_LICENSES.txt.
- AGENTS.md and `.agents/` role briefs: the security invariants and the specialist agents that work on the project.

- Visual garage home with six status zones, vehicle cards, recorded repair milestones and a full searchable queue.
- Accident reporting and staged recovery; registration/insurance renewal tasks; source-gated dispatch checklists with review owner, target date, history and handover evidence.
- Paged in-app alerts, recovery missions and handover XP, isolated demo practice, optional encrypted operational storage, and an Analytics route for the previous KPI dashboard.
- Vehicle-level usage coverage, source-generation checks and archived release evidence protect against stale or lost operational reviews.

- Security: restrict document previews, escape procedure Markdown, render tooltips on canvas, isolate offline caches, harden calendar and spreadsheet exports, and audit dependencies in CI.
- Reliability: serialise browser pipeline builds, wait for committed local writes, tolerate integer overflow during ingestion, and handle missing or degenerate metric evidence.
- Operations: live SOP queue with scoped checklists, owners, deadlines, evidence notes and downloadable handoffs. Metric search, keyboard selection, focused connections and bounded simulations.
- Design: revised light/dark palette, readable operational surfaces, navigation semantics and mobile graph access.

- **Licence:** from this version on, FleetOps is released under the
  [Functional Source License 1.1, MIT future licence](LICENSE.md). Free for your own fleet, research, teaching and
  client work; not for resale as a competing product. Each release becomes MIT two years after it is published.
  Versions up to 0.5.0 stay MIT.
- **Security hardening:**
  - Strict Content Security Policy: inline scripts pinned by SHA-256 at build time, no `'unsafe-inline'` for scripts.
  - Optional passphrase protection of the saved fleet (AES-256-GCM, PBKDF2 600,000 iterations), with an unlock bar.
  - The database engine runs in a blob worker covered by the page's policy, and DuckDB's parquet and json extensions
    are self-hosted with pinned hashes. Before, the engine fetched the parquet extension from extensions.duckdb.org.
  - Security end-to-end tests in CI (strict CSP on every page, injected script refused, hostile workbook, encryption at
    rest, OCR under the policy, same-origin requests only).
  - Signed build provenance for offline packages; GitHub Actions pinned to commit SHAs; installs without package
    scripts; OpenSSF Scorecard; secret scanning with push protection; private vulnerability reporting.
- Python 3.11 or newer is now required (3.10 reached end of life in October 2026); this lets the lock file move to
  Pillow 13.0.0, which fixes 43 published Pillow advisories (5 critical).
- Fixed: a demo build still running could finish after, and replace, the owner's fleet.
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


