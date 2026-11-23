# Case study: keeping a GCC fleet legal and on the road

**[Watch the 2-minute walkthrough](walkthrough.mp4)** · [Open the live demo](https://pemalahmad.github.io/FleetOps-KPI-Dashboard/)

> Every figure below comes from the built-in **simulated** demo fleet, "Sahra Mobility": 6,500 vehicles across the UAE,
> Saudi Arabia, Qatar, Kuwait, Bahrain, Oman and Türkiye, reported as of 1 October 2026. It shows what FleetOps finds and
> how; it is not a customer result.

## The problem

A fleet that runs across the GCC answers to six traffic authorities, each with its own registration, insurance,
inspection and operating-card rules. The facts that decide whether a vehicle may legally drive sit in spreadsheets,
scanned cards and workshop systems that do not talk to each other. So the questions that matter most every morning are
the hardest to answer:

- Which vehicles are on the road with an expired registration or insurance today?
- Which ones are about to need a technical inspection before renewal, by each country's own age rule?
- Why are vehicles off the road, for how long, and is it getting better?

## What FleetOps does

1. **Reads what the fleet already has.** Drop the vehicle list, document scans and service history; columns are
   recognised and mapped, cards are read on the device, and every value is checked against a data contract. A blank
   required field or an unreadable cost stops the build with the row count, instead of quietly becoming zero.
2. **Checks each vehicle against its own country's rules.** Registration, insurance, inspection by vehicle age, Saudi
   TGA operating cards and Bahrain's insurance-must-cover-registration rule, each with its authority, a dated source
   and a confidence level ([rules](GCC_COMPLIANCE.md)). Unpublished rules are left out, never guessed.
3. **Turns findings into one next action per vehicle,** and holds vehicles off the road behind gates that cannot be
   bypassed: an expired document, an open repair or an open damage case blocks the handover.
4. **Explains the numbers.** One north star (off-road hours per vehicle per month), a metric network that decomposes
   every movement into exact identities and measured drivers, and procedures (SOPs) that fire on live signals.

## What it found in the demo fleet

| Finding | Vehicles |
|---|---|
| GCC vehicles checked against their country's rules | 4,700 |
| Non-compliant today (expired registration, insurance or operating card) | 157 |
| Saudi goods vehicles with no TGA operating card on file | 182 |
| Renewals or inspections due soon | 784 |
| Fleet-register actions: ground now (registration or insurance expired) | 224 |
| Fleet-register actions: renew registration / insurance | 520 / 447 |
| Registration cards still to upload | 814 |

The 1,800 vehicles in Türkiye are reported as "not covered" by the GCC rules rather than silently passed.

## How it is built, and why

- **Runs entirely on the owner's device.** A static web app with an in-browser SQL warehouse (DuckDB-WASM): no
  server, no account, no telemetry. Fleet data never leaves the machine, which removes the hardest objection a
  regional operator has to new software.
- **One pipeline, two places.** The same SQL models, validation rules and data tests run in the browser and in the
  Python CLI, so an analyst and an operator see the same numbers.
- **Security that is tested, not promised.** A strict Content Security Policy with every script hashed, optional
  AES-256 encryption at rest that is all-or-nothing, hostile-spreadsheet and clickjacking tests, and releases that
  publish only after the full security suite passes.

## What a real pilot would measure

A four-week pilot on one depot (20–100 vehicles) would track, before and after:

- vehicles driven while non-compliant (target: zero),
- days from document expiry to renewal,
- off-road hours per vehicle per month,
- damage-case cycle time from report to controlled return.

## About

Built by Mohammad Alahmad from hands-on experience running vehicle sales, delivery, service and charging operations
across the GCC and wider EMEA. Source: [github.com/Pemalahmad/FleetOps-KPI-Dashboard](https://github.com/Pemalahmad/FleetOps-KPI-Dashboard).
