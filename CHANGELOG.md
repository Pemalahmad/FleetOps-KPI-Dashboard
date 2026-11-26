# Changelog

What changed in each version of FleetOps KPI. Dates are release dates; the newest version is at the top.

## Unreleased

### Replace or keep planner (2026-11-26)
- New **Replace or keep** page under Operate. For every active vehicle it shows cost per km to date, then prices keeping it against replacing it now with a new petrol vehicle or a new EV over a planning horizon (5 years by default), with the break-even year and one recommendation: Keep, Replace with EV, Replace with ICE or Review, each with a one-line reason.
- The fleet summary gives the capital needed (new prices less the resale value of the vehicles replaced) and the saving over the horizon.
- Replacement prices, energy use, first-year maintenance and how fast maintenance rises with age come from your own register, energy and workshop records; prices and depreciation come from your fleet settings. Anything the records lack is a placeholder marked as such. Every input is editable in the tab, and "How this is calculated" lists each formula. Collision repairs count in the cost to date but are not projected forward as wear.
- Download the plan, with the assumptions used, as a CSV file.

### GCC vehicle release

- Garage now checks official registration classes and inspection evidence for the UAE, Saudi Arabia, Qatar, Kuwait and Oman, alongside Bahrain.
- Release reviews use each jurisdiction's published class rules or a referenced official inspection date where applicable. A recorded failed inspection holds release until a later passing report is on file.

- Fixed a browser upgrade issue that could pair a newly deployed page with an older offline SQL manifest. Returning browsers refresh the app cache, and the release dashboard requests the manifest that matches its build.

### Bahrain vehicle release (2026-11-26)

- Garage and Daily Command now use the official registration type to check Bahrain's technical inspection requirement. Private cars use the exact manufacture date to determine the five-year exemption.
- Release holds identify missing registration class, manufacture date or current inspection evidence. Recorded handovers include the class and inspection outcome.
- Fixed a browser import error when workbooks include a document ID column.

### Procedures page, set like a document (2026-11-26)
- Doctrine & SOPs is rebuilt as a plain reading page: the illustration, emoji, slogan, uppercase label and left-accent boxes are gone. Purple now marks only the selected procedure and ticked steps.
- The list shows which procedures need attention with a shape and a word. Each procedure opens with its purpose, why it is flagged, who is accountable and numbered steps. On a phone, choosing a procedure scrolls to it.

### Vehicle release review (2026-11-25)
- Garage rechecks applicable GCC operating-card, insurance-period and inspection evidence before recording a handover. Daily Command shows the same release blockers and links to the rule evidence.
- Daily Command provides searchable queues for held vehicles, missing evidence, review-ready handovers, renewals and every SOP-09 stage. Export the shift handoff or a recorded vehicle release.
- Place a damage hold immediately, then complete classification, escalation deadlines with sources, repair approvals and quality checks. The case keeps late completion and recovery owner changes in its records.
- Added a guided synthetic damage case and a four-week depot pilot protocol.

### Daily fleet command (2026-11-25)
- The Garage now opens as a daily command board: critical holds, overdue damage notifications, accident recovery, renewals, dispatch review and today’s handovers are visible in one continuous full-width operating surface.
- Priority exceptions show their owner and nearest notification deadline with a direct vehicle action. The damage recovery pipeline follows SOP-09, and country-level registration and insurance evidence links directly to the GCC compliance desk.
- Operate is now the first navigation group, **Daily command** is the first tab, and the mobile tab strip keeps the active destination centred so moving between wide and narrow workspaces no longer loses the current tab.
- Removed the Garage pointer, glare and decorative dot effects. Safety holds, evidence requirements and encrypted local-only storage are unchanged.

### Fills the screen, and an easier dark mode (2026-11-23)
- The dashboard now uses the full width of the window instead of a 1,480 px column, so wide and ultra-wide screens show no empty side bands. Summary strips wrap and stretch to fill every row (no empty slot at the end), and the service board's columns share the full width.
- The theme switch now reads "Dark mode" / "Light mode" next to its icon, and reports its state to screen readers. It still follows your system setting until you choose.
- Fixed: KPI trend lines could show a gap when a tile was very wide.

### Service board (2026-11-23)
- New **Service board** page under Operate: every repair order moves Scheduled → Arrived → Service ready → In service → Diagnosis → Service complete → Delivered, with **On hold** (waiting for parts, approval or a bay) available from any active stage and resuming where it left off. Each move records who made it, when, and the technician it is assigned to.
- Each order has a full job sheet: condition at arrival and delivery (odometer in and out, fuel or charge, body, interior, warning lights, and tread, pressure and condition of all four tyres), work lines with the issue, diagnosis, work done and pay type (customer pay, warranty, recall or retrofit, with the claim or campaign number), estimated vs logged technician hours, parts changed, comments from technicians, advisors and owners, an invoice split by pay type, and the vehicle's full service history.
- Moves are checked: no arrival without the check-in and all four tyres, no stage without an assigned technician, no completion without diagnosis, work done, estimate, claim number and logged hours, and no delivery without the odometer out and an issued invoice.
- Reports: orders by stage, hold reasons, technician efficiency (estimated ÷ logged hours), charges by pay type, average time in the workshop and customer-pay revenue. The demo opens with sample orders in every stage; your own orders are saved encrypted with your fleet ([PRIVACY.md](PRIVACY.md)).

### Widgets fill instantly on a first visit (2026-11-23)
- A first visit used to show empty placeholders for 8–13 seconds while the in-browser SQL engine (about 15 MB) downloaded and the demo pipeline ran. Every widget now shows the demo fleet's saved results within about a second, labelled "Showing saved demo results while the live SQL engine loads…", and the live engine replaces them as soon as it is ready.
- The preview is demo data only, never your own fleet; it is ignored automatically if the SQL models change, and the end-to-end suite fails until it is regenerated (`npm run demo-preview`). About 1.5 MB to download, and not stored in the offline package.
- The end-to-end test server no longer crashes when a file is missing.

### Dispatch lab (2026-11-23)
- New **Dispatch lab** page under Operate: a seeded simulation that runs the same day of jobs through four dispatch rules (shortest distance, highest margin, least deadhead, and earliest deadline as a reference) for delivery vans, shuttle and charter buses, or commercial trucks.
- Compares SLA on-time delivery, empty-mile (deadhead) ratio, driver shift utilisation, turnaround per job, margin per vehicle-day and jobs served, each as the mean of 20 simulated days with a 95% confidence interval, plus an on-time vs empty-miles trade-off chart. Fleet size, demand level and seed are adjustable.
- Runs entirely in the browser. The model, metric definitions and its limits are in [docs/DISPATCH_LAB.md](docs/DISPATCH_LAB.md).

### GCC compliance by country (2026-11-23)
- The Licence page now checks every active vehicle against its country's published rules for the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman: registration, insurance, technical inspection by vehicle age, Saudi TGA operating cards for goods vehicles, and Bahrain's rule that insurance must cover the whole registration period.
- Each vehicle gets one status (Non-compliant, Evidence missing, Expiring, Compliant, or Not covered outside the six countries) with the reason in plain words, and each country shows its authority, a dated source link and how confident the rule is.
- Rules that are not officially published (Bahrain's inspection age, for one) are left out rather than guessed. FleetOps checks your records; it does not certify a vehicle. See [docs/GCC_COMPLIANCE.md](docs/GCC_COMPLIANCE.md).

### Reliability and security fixes (2026-11-23)
- **Passphrase protection is all-or-nothing.** Setting or removing a passphrase now seals or unseals the whole fleet in one storage transaction, so a closed tab or full disk can no longer leave some records readable while the fleet shows as protected. A fleet left half-sealed by an earlier version stays locked and is sealed completely the next time it is unlocked.
- **Saves no longer overwrite each other.** A followed file re-importing while a document is scanned now keeps both changes. Deleting a document removes its listing before its scan, so a failed save never loses the original.
- **Road ready means road ready today.** Registration and insurance on your own fleet are checked against today's date, not only the report date. A vehicle handed over on the day a document expires moves to renewal the next day, with an expired-document alert, and an open garage re-checks just after midnight.
- **Imports check values, not just columns.** Blank required cells and values that cannot be read (a cost of "abc", say) now stop the build with the column and row count on the Pipeline page, as the Python pipeline already did. An optional sheet you add must still have its own required columns.
- **The offline package never downloads code.** Without Python, Ruby or PHP, the Mac and Linux launchers now use a small server shipped in the package instead of fetching one from npm.
- **Documents attach to the right vehicle.** A card read by its VIN no longer lands on another vehicle whose fleet number happens to equal that VIN, and a reference that fits two vehicles (two cars with the same plate) is left unattached for you to check instead of being guessed.
- **No more "p NaN".** The metric network shows a defined result when both groups are at 100%, and "n/a" for any test that cannot be computed.
- **Nothing is published without the security tests.** The hosted dashboard and offline releases now deploy only after the full CI suite passes, including the strict-CSP, encryption, hostile-file and clickjacking tests.

### Complete vehicle damage escalation (2026-11-23)
- Garage accident intake now records severity, drivability, safety facts, an active operational hold, and explicit police, insurer and management decisions with authority/policy-derived deadlines. FleetOps records these actions but makes no network calls and assumes no universal GCC deadline.
- Each damage case tracks referenced evidence, notification completion, estimate and authorization, repair records, quality checks, overdue alerts and an append-only audit history. Every recovery stage is blocked until its recorded gate passes.
- Dispatch rechecks current source and damage evidence, keeps the hold active until a successful handover, and retains an immutable closure snapshot. Legacy GarageState v1 incidents are normalised conservatively instead of being treated as clear.
- Added SOP-09, **Vehicle damage escalation and controlled return**, linked from Garage and available in Doctrine with a live open-case signal. Garage, privacy and operating documentation now describe the workflow and storage boundary.

### Design checklist completed (2026-11-20)
- Every data page now says when its numbers are from: "Data as of September 2026 · simulated demo fleet" (or "your fleet, on this device") under the page title, on the garage, Analytics, Fleet register, Drivers, Workshop, Ledger, Licence, Customer clock and Metric network.
- Loading placeholders no longer wait for ever: if the warehouse build or a query fails, they turn into a plain error state ("This view could not load", the reason, and a reload button). Tables with no rows (Fleet register and Drivers searches, Workshop open jobs, Ledger, Licence expiries and repeat offenders) say so instead of showing an empty grid.
- Numbers and changes stay left to right inside an Arabic (right-to-left) layout. Checked: no horizontal scroll at 360 px on all 16 pages, visible keyboard focus, light and dark.
- New README GIFs for Analytics, the garage and the metric network.

### Design principles applied (2026-11-20)
- Every text colour now passes WCAG AA (4.5:1) in light and dark: faint text, good, warn and bad are darker in light mode (#6b7189, #047857, #b45309, #be123c) and faint is lighter in dark mode; purple used as small text uses the new `--accent-ink` (#4f46e5), while #6366f1 stays the accent for fills, dots and icons.
- Geist and Geist Mono, bundled from the `geist` npm package (SIL OFL) and served from the app's own origin, so no font host and no CSP change; the system fonts remain the fallback.
- KPI tiles follow one anatomy: an accent dot before the label, thin tabular headline numbers (the north star, metric tiles, stat strips, the metric network), and status in words ("Watch", "Off target"; "On target" for screen readers) as well as colour. Card titles carry the dot too.
- Tiles rise in once, in grid order (fade, 18 px rise and slight grow, cubic ease-out, 60 ms apart); reduced motion keeps them still. New Analytics GIF.

### Design principles (2026-11-20)
- New docs/DESIGN_PRINCIPLES.md: one tile style on a cell grid, tile anatomy, one accent used as meaning, thin tabular numerals, motion as a pure function of time, the four data states, contrast, dark mode, Arabic and a "Done when" checklist. The design agent and AGENTS.md now point to it. It records that the light-mode faint, good and warn colours and small accent text fall short of WCAG AA, with the shades to use instead.

### README information architecture and visual tour (2026-11-20)
- Rebuilt the root README around a concise product explanation, a 30-second evaluation path, verified local setup, engineering guarantees, an honest scope statement and links to the detailed documentation.
- Added curated architecture and metric-network graphs, reduced the visual tour to the most useful GIFs, and recaptured the Analytics GIF so it reflects the current icons, graphics and motion design.

### Analytics control-board polish (2026-11-20)
- Analytics now uses consistent fleet and operations icons in place of platform-dependent emoji for KPI groups, a clearer north-star instrument, stronger target-state marks and more legible scorecard risk cells.
- The header illustration is now a purpose-built fleet telemetry scene. Motion is a short staged reveal and route sequence; the pointer swarm and its persistent toggle were removed from Analytics. Reduced-motion preferences still stop every effect.

### Warranty, add-ons, service contacts, driver status and system design (2026-11-19)
- Every VIN: warranty cover by coverage (status by date and kilometres, days and km left, contract), add-on equipment (EV chargers and battery packs, self-driving hardware and software, cameras, telematics, fit-outs) and the maker's service-centre contacts per desk, in the vehicle sheet; a fleet-wide warranty and add-ons section on the register. New optional sheets `warranties`, `vehicle_addons`, `service_contacts`; 4 new SQL models, 1 test, 3 rules.
- Drivers: employment status (Active, On leave, Suspended, Inactive) in the driver file and register; a live "Driver status now" board (on a trip, available, on a break, off duty, on leave, suspended) with a moving roster; live counters open on the day so far and the feed opens pre-filled.
- New System design page: DNS, CDNs, load balancing, caching, rate limiting, SQL vs NoSQL, indexing, replication, sharding, CAP, microservices, circuit breakers, messages and queues, each with how a fleet platform uses it and where FleetOps stands; animated architecture, CAP and sharding diagrams; live circuit-breaker, rate-limiter and queue demos. Also in docs/SYSTEM_DESIGN.md.
- The VIN decoder is guarded by a rate limiter (burst of 3, then one batch every 1.5 s) and a circuit breaker (30 s pause after 3 failed batches) from the new lib/resilience.ts, with 8 tests.

### Illustrations, emoji and Arc UI (2026-11-18)
- A vector illustration on every page header, drawn in code and coloured from the theme: the garage with a car driving in, charts for Analytics, a steering wheel on the road for Drivers, a car on a lift for Workshop, clocks, invoices, ID cards, a spreadsheet flowing into the database, and more. Wheels turn, roads move and badges float; all still for reduced motion.
- Emoji beside section titles, on every KPI group and on every live event (🚗 trip, 🔧 check-in, ✅ ready, ⚡ charged, ⛽ refuelled, 🧾 fine, ⚠️ alert).
- Arc UI (MIT): Button (spring press, morphing labels) for the main actions, and ring Gauges for headline KPIs on Analytics (utilisation, PM compliance, first-time fix, registration, insurance, fleet health) and Drivers (compliance, safety, licences). Every other button restyled to match.

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

