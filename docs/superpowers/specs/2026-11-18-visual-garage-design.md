# Visual garage and road-readiness workspace

The home dashboard becomes a fleet garage, using the original purple light/dark palette. The existing analytical dashboard moves to /overview/ and remains available in navigation.

## Approach

A two-dimensional garage board is the implementation choice: recognizable cars in service bays, renewal desks, incident intake and dispatch areas. A plain task board would lose the requested garage metaphor; a 3D scene would make thousands of vehicles harder to scan and add unnecessary rendering dependencies.

## Experience

- A garage floor groups vehicles into On road, Repair bays, Renewal desk, Accident intake and Dispatch review. Every area shows its full count and a small, clearly labelled preview of up to three cars; a searchable fleet queue supports the full dataset.
- Selecting a car opens its detail panel: current blockers, repair milestone bar, registration/insurance status, checklist, owner, target date and history.
- The road checklist combines source evidence (registration, insurance, repairs, maintenance) with recorded walkaround, road test and handover checks. Unknown evidence is a gap. Expiring-but-current documents remain lawful with a renewal warning. Expired documents and unresolved repairs cannot be waived with points or manual progress.
- Repairs use timestamps from raw work orders, rather than time-based simulated percentages. A raw ready-at timestamp identifies completed repair work awaiting collection/review.
- Report accident records a local incident, holds the vehicle, creates an in-app notification and starts a staged recovery workflow. Open imported Collision work orders produce the same attention signal. Incident reports have explicit owners and recovery stages.
- An in-app notification centre highlights incidents, expired documents, ready repairs and overdue maintenance. Notifications update when source data rebuilds or a local operation changes; the product does not imply a live telematics feed or external messaging.
- Missions focus on releasing blocked vehicles, resolving expiry issues and completing handovers. Readiness badges and recorded handover counts reward useful work without weakening legal/safety gates.

## Data and persistence

Garage operational state is an optional field in the existing Workspace, saved through its current encryption and IndexedDB path. Demo actions use isolated session memory and never become the owner's data. Region filtering only changes the view; operational records remain attached to vehicle IDs and dataset identity. No new service, account, network permission or dependency is needed.

The browser SQL query combines the existing fleet register, maintenance state and latest/raw open work orders. Registry-only mode must show missing operational evidence rather than presenting a fully assessed fleet. Existing filters, imports, document scanning, vault protection and analytical pages continue to work.

## Release semantics

The app records a dispatch review; it is not a legal certificate or a replacement for a competent person's physical checks. A handover requires a named reviewer, all source gates satisfied, all release checks and no unresolved repair. An incident can only close through the successful handover action. New incidents reset that vehicle's manual release checks. Source data always outranks manual notes.

## Validation

Pure-function tests cover lane precedence, expired/unknown documents, multiple simultaneous repair orders, recorded milestones, manual incident progression, prevented unsafe release, filter/dataset isolation and idempotent handover. UI verification covers 6,500-vehicle demo performance, search, detail, notifications, accident reporting, checklist interactions, source-gate blocking and small screens. Run lint, types, unit tests and production build; preserve the latest upstream security work on publication.

## Review refinements

- Maintenance coverage is checked per vehicle, treating monthly first-of-month usage rows as coverage through month end.
- Live handovers require a report no more than one calendar day old and document dates valid today; demo handovers use the report date and remain practice.
- Queued operations reject a warehouse generation changed by a preceding rebuild.
- Handovers retain a copy of source gates and the signed review; source/incident resets archive earlier notes.
- The alert inbox pages every 50 entries, filters by type and places unread entries first.
