# Service board

Repair orders from booking to delivery, at **Operate → Service board**. The rules live in
[`web/src/lib/service.ts`](../web/src/lib/service.ts) (tested in `service.test.ts`); the demo's sample orders are built
by [`service-demo.ts`](../web/src/lib/service-demo.ts) through the same rules, so every sample order is one the rules accept.

## Stages

**Scheduled → Arrived → Service ready → In service → Diagnosis → Service complete → Delivered**

**On hold** is a waiting state (parts, customer or warranty approval, a bay, a specialist). It can be entered from any
active stage with a reason, and resuming returns the order to the stage it left. Every move records when it happened,
who made it and who the stage is assigned to.

| Move to | Needs |
|---|---|
| Arrived | Check-in: odometer, exterior and interior condition, and the condition of all four tyres |
| Any later stage | A technician (or advisor) assigned to the stage |
| Diagnosis | At least one reported issue |
| Service complete | For every line: diagnosis, work done and estimated hours; a claim or campaign number for warranty, recall and retrofit lines; technician hours logged |
| Delivered | Odometer and condition at delivery (odometer out never below odometer in) and an issued invoice (a zero invoice for warranty, recall or retrofit work) |

A delivered order is closed to edits; comments can still be added.

## The job sheet

- **Check-in and check-out:** odometer, fuel or charge %, exterior, interior, warning lights, new damage noted with the
  customer, and tread depth (mm), pressure (psi) and condition for each tyre.
- **Work lines:** issue reported, diagnosis, work done, pay type (customer pay, warranty, recall, retrofit), claim or
  campaign number, estimated labour hours and the parts changed (part number, description, quantity, unit price).
- **Time:** hours logged by each technician against a line.
- **Comments:** from technicians, advisors and owners, each with its author and time.
- **Invoice:** number, status (draft, issued, paid) and labour rate. Labour is billed at the estimated (flat-rate) hours,
  or the logged hours when no estimate is set; charges are split by pay type into what the customer pays and what is
  claimed from warranty, recall or retrofit.
- **History:** every visit of the vehicle with odometer in and out, the lowest tyre tread at arrival, the work and the
  customer charge.

## Reports

Orders by stage, why orders are on hold, technician efficiency (estimated ÷ logged hours on the same work; below 85% is
flagged), charges by pay type, deliveries in the last 7 days, average time in the workshop (arrival to delivery),
customer-pay revenue on delivered orders, and claim numbers still due at Diagnosis.

## Storage

Your orders are saved with the rest of your fleet on this device and sealed by the optional passphrase; nothing is sent
anywhere. The demo's orders live in the browser tab and reset on reload.
