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
| Fleet-register actions: ground now (registration or insurance expired) | 224 |
| Fleet-register actions: renew registration / insurance | 520 / 447 |
| Registration cards still to upload | 814 |

The 1,800 vehicles in Türkiye are outside the GCC rule pack. The Licence report shows current demo counts for expired
documents, missing operating cards and upcoming renewals or inspections.

## How it is built, and why

- **Runs entirely on the owner's device.** A static web app with an in-browser SQL warehouse (DuckDB-WASM): no
  server, no account, no telemetry. Fleet data never leaves the machine, which removes the hardest objection a
  regional operator has to new software.
- **One pipeline, two places.** The same SQL models, validation rules and data tests run in the browser and in the
  Python CLI, so an analyst and an operator see the same numbers.
- **Security that is tested, not promised.** A strict Content Security Policy with every script hashed, optional
  AES-256 encryption at rest that is all-or-nothing, hostile-spreadsheet and clickjacking tests, and releases that
  publish only after the full security suite passes.

## Four-week depot pilot

Start with one Dubai rental depot of 20–100 vehicles, one fleet lead who runs the morning review and one named
release reviewer. Keep the current booking and workshop systems in place. The maintainer runs one working
session with the fleet lead using the depot’s own export on its device.

| Week | What to do | What to record |
|---|---|---|
| 1 | Watch the lead make release decisions using the current process. Match each case to the documents, workshop record and named approval. | Minutes from starting a review to producing a decision another reviewer can verify. Record the case type and missing evidence. |
| 2 | Import the same categories of records into FleetOps. Work the release desk alongside the existing process. | Timing for comparable cases, agreement with the reviewer, and any clearance that the source evidence does not support. |
| 3 | Run the queue at each shift. Use real incidents when they occur and replay approved, de-identified historical cases for rare scenarios. | Overdue open escalations, time off road and handovers completed with evidence. Count actual use without collecting telemetry. |
| 4 | Compare the medians and report the number of cases behind them. Ask the depot lead whether they would pay to continue using the workflow. | Same-task time change, incorrect clearances, consecutive shifts of independent use and willingness to pay. |

The primary target is a tenfold improvement in time to assemble a reviewable decision, measured against the depot’s
own baseline. If the median is 20 minutes, the target is two. Treat zero unsupported releases as a separate acceptance
condition. Replays and genuine incidents are reported separately. The demo walkthrough illustrates the workflow and
the pilot provides customer evidence.

Before expanding, record which missing document types, source formats or rule edge cases slowed down each
review. Turn repeatable findings into regression fixtures and keep each rule’s source and confidence reviewable.

## About

Built by Mohammad Alahmad from hands-on experience running vehicle sales, delivery, service and charging operations
across the GCC and wider EMEA. Source: [github.com/Pemalahmad/FleetOps-KPI-Dashboard](https://github.com/Pemalahmad/FleetOps-KPI-Dashboard).
