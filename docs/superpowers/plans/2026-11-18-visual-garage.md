# Visual Garage Implementation Plan

**Goal:** Make the dashboard a recognizable garage with evidence-based vehicle stages, recovery missions and dispatch checklists.

**Architecture:** Pure garage rules derive lanes, gates, milestones and notifications from SQL rows and saved operations. A garage client page renders the board and detail workflow; the current KPI dashboard remains at /overview/. All owner operations use the existing Workspace save/encryption path, with demo operations isolated in memory.

**Tech Stack:** Existing Next.js, React, TypeScript, Tailwind, Phosphor icons, Radix dialogs and DuckDB-WASM.

**Spec:** ../specs/2026-11-18-visual-garage-design.md

## Global constraints

- Preserve original purple light/dark colors and current security/vault code.
- No new dependencies, external messages, telematics claims or automatic legal clearance.
- Expired/unknown documents and unresolved repair work remain release blockers.
- Demo writes never alter the owner's Workspace.

## Review focus

- Several open work orders: one ready job must not conceal another incomplete job.
- Missing operational tables: registry-only evidence must not read as fully assessed readiness.
- New incident: stale checklist progress must not carry into the new recovery.
- Repeated handover: no duplicate credit, accidental closure or replay.
- Async workspace persistence: errors must remain visible and updates must not lose other fleet state.

## Tasks

1. Garage rules and source query — create web/src/lib/garage.ts and garage.test.ts. Define GarageRow, GarageState, incident/review types, deriveVehicle, buildAlerts and release transition helpers. Assert each safety/replay case above.
2. Saved operations — add optional garage state to Workspace and a garage state hook using commit with rebuild false. Preserve encryption. Demo writes remain component memory. Surface persistence failures.
3. Garage interface — create web/src/components/garage/* with a visual bay board, compact car illustration, searchable queue, detail dialog, accident report dialog, alerts and missions. Use recorded milestones and labelled checklist progress.
4. Navigation — move existing overview to /overview/ and render the garage at /. Retain all prior KPI content and existing fleet, licence, workshop and SOP pages.
5. Verify and publish — lint, typecheck, unit tests, production build and live browser checks. Publish an atomic commit based on the latest main head and verify deployment.
