# FleetOps as fleet software: what it does, and what it borrows

FleetOps KPI started as an analytics project. It is now usable by anyone who runs vehicles: open the
[live app](https://pemalahmad.github.io/FleetOps-KPI-Dashboard/), import a vehicle list, scan the registration
cards, and the fleet register, compliance and (with service history) the operating KPIs are live. Everything runs
in the browser; the fleet's data stays on the owner's device.

## The owner's path

| Step | Page | What happens |
|---|---|---|
| 1. Import the vehicle list | **Import** | Any Excel workbook (every sheet), CSV, Parquet or JSON. Title rows above the header are skipped, Excel dates are read as dates, and each sheet is recognised as a table (vehicles, documents, work orders…) with its columns mapped for review. A column can also be set to one value for every row. |
| 2. Scan the documents | **Documents** | Photos or PDFs of registration cards (mulkiya, istimara, ruhsat, V5C), insurance policies, inspections and permits. Read in the browser (English and Arabic OCR, PDF text), matched to the vehicle by VIN, plate or fleet number, typed, dated, and confirmed by the owner. A card that matches no vehicle can create it. |
| 3. Read the register | **Fleet register** | One row per vehicle: VIN (format, check digit, model year and make decoded offline), plate, make, model, year, trim, configuration, colour, registration and insurance status from the latest document, service record, fines, and one next action ("Ground: registration expired", "Renew insurance", "Upload the registration card", "Check the VIN"). |
| 4. Decode VINs (optional) | **Fleet register** | With the owner's click, valid VINs missing model, trim or configuration are decoded by NHTSA's public vPIC service. Only the VINs are sent. Blanks are filled; nothing the owner supplied is overwritten. |
| 5. Add service history | **Import** | Work orders (and usage, ratings, parts, fines) switch the fleet from registry mode to operations mode: the three clocks, the metric network and every operating KPI. |

Saved in the browser (IndexedDB): imported sheets and mappings, scanned documents with their files, VIN decodes.
"Delete my fleet data" on the Import page removes all of it.

## What the established platforms do well, and what FleetOps takes from each

| Platform | Known for | Taken into FleetOps | Not taken, and why |
|---|---|---|---|
| **Fleetio** | Fleet maintenance system of record: vehicle profiles with VIN decoding, documents and renewal reminders, service history, spreadsheet imports | The vehicle register as the system of record; VIN decoding (offline rules plus vPIC); a document vault whose expiries drive compliance; a spreadsheet import with column mapping | Parts inventory and purchase orders: out of scope for an analytics-first tool |
| **Samsara** | Connected operations: telematics gateways, dashcams, driver app, one view across assets | One place that joins identity, licence, maintenance and cost per vehicle; vehicle exports from Samsara import directly | Live GPS, dashcams, engine diagnostics: they need in-vehicle hardware |
| **Motive** | Driver safety and compliance, inspections, spend control | Compliance as a gate with a next action per vehicle; fines treated as licence events with repeat-offender tracking | ELD / hours-of-service logging: a North American regulatory device feature |
| **Geotab** | Open telematics platform: data connectors, rules and exceptions, EV suitability | An open, documented data contract; rules as plain SQL (41 validation rules, SOP triggers); cost per km and value retained by powertrain for EV-versus-ICE decisions | Device-level data streams: hardware again |
| **Verizon Connect** | Dashboards, scorecards, alerts, maintenance scheduling | Scorecards against targets, renewal waves by week, site league tables | Real-time dispatch and routing |

What none of them publishes, and FleetOps does: the mathematics. Every KPI sits in one network of exact identities
(north star = visits × hours per visit) and measured drivers with standard errors, p-values and confidence
intervals, all computed by tested SQL and TypeScript that anyone can read.

## Feature map against the market

Sources: vendor feature pages and independent listings (Fleetio features page; Software Advice, Capterra, G2 and
B2B Reviews listings; 2026 comparison guides). ✅ in FleetOps today · 🆕 added in 0.5 · 🔜 next, no hardware needed ·
🛰️ needs in-vehicle hardware (FleetOps imports the data instead).

| Feature | Who is known for it | FleetOps |
|---|---|---|
| Vehicle register / profiles, VIN decoding | Fleetio | ✅ register, offline VIN rules, vPIC decode |
| Spreadsheet import with column mapping | Fleetio | ✅ any workbook, every sheet, platform exports recognised |
| Document storage with renewal tracking | Fleetio | ✅ vault, OCR (English + Arabic), expiry drives compliance |
| Renewal reminders | Fleetio, Verizon Connect | 🆕 calendar file (.ics) with alerts 30 and 7 days before |
| Export to Excel | all | 🆕 register export, protected against formula injection |
| Offline use | Fleetio (mobile inspections) | 🆕 installable app + downloadable package, fully offline |
| Preventive-maintenance schedules and service reminders | Fleetio, Samsara, Geotab | ✅ PM compliance by km or months per powertrain; 🔜 per-vehicle service reminders in the calendar export |
| Work orders and service history | Fleetio | ✅ imported and analysed (three clocks, repeat repairs); 🔜 create and close work orders in the app |
| Cost per mile / km, total cost of ownership | Fleetio, Geotab | ✅ by powertrain: energy, maintenance, depreciation |
| Fuel and charging tracking | Fleetio, Samsara, Motive | ✅ imported (energy table); 🔜 manual entry |
| Parts and inventory, low-stock alerts | Fleetio | ✅ parts orders vs supplier ETA; 🔜 stock levels and reorder points |
| Vehicle inspections (DVIR) with photos | Fleetio, Motive, Samsara | 🔜 checklist on a phone, photos kept on the device, failed items open an issue |
| Issues and defect tracking | Fleetio | 🔜 issue log per vehicle, linked to inspections and work orders |
| Fines and violations | Motive (compliance) | ✅ fines by type, repeat offenders, unpaid amounts |
| Recalls | Fleetio | ✅ campaigns, completion curves |
| Scorecards, dashboards, league tables | Verizon Connect, Samsara | ✅ scorecard, site league, metric network |
| Rules, alerts and exceptions | Geotab | ✅ 42 SQL rules and SOP triggers; 🔜 notifications |
| EV suitability / electrification planning | Geotab | ✅ cost per km and value retained by powertrain; 🔜 replacement simulator |
| Driver management and assignments | Fleetio, Motive | 🔜 driver list and vehicle assignment history |
| Open data, APIs, integrations | Geotab | ✅ documented data contract, SQL catalogue; 🔜 telematics connectors (Samsara, Geotab, Motive APIs) |
| Live GPS tracking, geofences, routing | Samsara, Verizon Connect, Geotab | 🛰️ |
| AI dash cams, driver-safety scoring | Samsara, Motive | 🛰️ |
| ELD / hours of service | Motive, Samsara | 🛰️ (a North American regulatory device) |
| Engine diagnostics and fault codes | Geotab, Samsara | 🛰️ imported when exported |
| Published mathematics behind every KPI | none of them | ✅ identities, regressions with standard errors, tested |

### Where "a couple of bucks" sits

Published prices put maintenance-first software around **$4-7 per vehicle per month** (Fleetio's Essential and
Professional tiers, as listed by Software Advice) and telematics platforms around **$27-60 per vehicle per month**
with multi-year contracts (Samsara, per 2026 comparison guides). A no-hardware, local-first tool at about
**$1-2 per vehicle per month, free up to 10 vehicles**, would undercut both while charging for something real. The
licence gate (`web/src/lib/license.ts`) already supports plans with vehicle limits; it stays open until you decide.

## Honest limits

- **No hardware.** Odometer, engine hours, location and fault codes come from telematics. FleetOps reads them from
  the exports those platforms already provide (as `usage`), not from devices.
- **One device per fleet.** Data lives in the browser it was imported into. Sharing with a team needs a backend
  (accounts, sync), the next step if the product goes multi-user.
- **OCR needs a readable photo.** Every scanned field is shown for review and nothing counts until confirmed.
- **vPIC is North-American-first.** Vehicles built for other markets often decode make and year only; the offline
  WMI table and the owner's own columns fill the rest.

## Next steps toward parity

1. Telematics connectors: pull odometer and engine hours from the Samsara, Geotab and Motive APIs with the owner's key.
2. Reminders: renewal and service alerts by email or WhatsApp before a vehicle is grounded.
3. Accounts and sync, so a fleet team shares one register.
4. A phone flow for drivers: photograph the card or the damage at handover.
5. Arabic interface.
