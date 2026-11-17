# The Three Clocks Doctrine

*An operating doctrine for fleet service operations, by Mohammad Alahmad.*

> **A vehicle in the workshop runs three clocks at once. Manage all three, or someone pays for the one you forgot.**

Most fleet operations measure the workshop's clock: how long the job card was open. The customer never sees that clock, and the business does not earn on it. This doctrine makes three clocks the unit of management, puts a ledger and a licence beside them, and turns every flag into an owner with a deadline.

---

## 1. The three clocks

```
 key in ──────────── ready ──────── key back ─────────── earning again
   │◄──── Workshop clock ────►│◄ pick-up ►│◄ back to operations ►│
   │◄──────────── Customer clock ────────►│                      │
   │◄──────────────────────────── Fleet clock ───────────────────►│
```

| Clock | Runs from → to | What it costs if ignored | fleetkpi measures |
|---|---|---|---|
| **Customer clock** | key handed in → key handed back | Satisfaction, loyalty, 1-2 star ratings | Key-to-key (p50/p90), CSAT, 1-2★ share, average rating |
| **Workshop clock** | key handed in → vehicle ready | Capacity, cost, rework | Turnaround, technician productivity, days of backlog, parts ETA reliability, repeat repairs |
| **Fleet clock** | key handed in → vehicle earning again | Revenue and availability | Time to pick up, back to operations, off-road hours, availability |

The clocks nest: **Fleet = Workshop + pick-up + back to operations**. The pipeline checks this identity on every work order (SQL test `t18`).

## 2. The ledger and the licence

Two things sit beside the clocks.

- **The ledger:** what each visit costs, and who pays. This covers service spend per vehicle, goodwill, depreciation and book value, cost per km by powertrain, and cost against budget.
- **The licence:** whether the vehicle may legally and safely drive. This covers registration, insurance, preventive-maintenance interval, open recalls and fines.

A clock can be traded off. The licence cannot.

## 3. The seven laws

1. **Count the hours the customer counts.** The job card is the workshop's story; key-to-key is the customer's. When they disagree, the customer is right. *(Key-to-key, CSAT)*
2. **A vehicle is not fixed until it is earning.** "Ready" is a workshop milestone, not an outcome. Close the gap from ready to back in operations as hard as the repair itself. *(Time to pick up, back to operations, availability)*
3. **Fix it once, or pay three times.** A comeback costs the second repair, the goodwill to keep the customer, and the hours off the road. *(Repeat repairs, repeat visits, first-time fix, goodwill %)*
4. **A parts ETA is a promise; track promises like money.** A supplier who misses ETAs moves your workshop clock without touching your workshop. Rank suppliers on promises kept, not price alone. *(Parts on-time %, days late, open overdue orders)*
5. **Every flag has an owner within 48 hours.** A red number without a name and a date is decoration. Each flag maps to an SOP with an owner, a cadence and exit criteria. *(SOP-01 to SOP-08)*
6. **The licence is a gate, not a score.** Registration, insurance and overdue maintenance are not traded against speed or cost. An expired vehicle is grounded until it is renewed. *(Registration & insurance status, PM compliance, fines)*
7. **Recognise in public, fix in private.** The league table celebrates the best sites and the biggest comebacks; struggling sites get an intervention plan, not a public shaming. *(Ops Score, tiers, streaks, badges)*

## 4. The north star

**Off-road hours per vehicle per month:** the fleet clock, summed. It moves when any clock or any law is broken. A slow workshop, a missed parts promise, a comeback, a vehicle waiting for a driver, an expired registration grounding a car: every failure shows up here first. Availability is the same number seen from the other side.

## 5. The rhythm

| Cadence | Ritual | Reads | SOP |
|---|---|---|---|
| **Daily, 10 minutes** | Clock check: yesterday's 1-2★ ratings, parts now overdue, expired documents, vehicles ready but not collected | Customer, Workshop, Compliance | SOP-07, SOP-08 |
| **Weekly, 30 minutes** | Three-clock review: the INTERVENE sites, the league table, backlog days, repeat repairs | Overview, Workshop | SOP-02, SOP-03, SOP-05 |
| **Monthly** | The ledger: cost vs budget, cost per km by powertrain, goodwill, service spend outliers, fines | Fleet & Assets, Compliance | SOP-06 |
| **Per event** | Recall launch, new fleet onboarded, a site flagged | Compliance, Pipeline | SOP-04, SOP-01, SOP-03 |

## 6. Decision rules when the clocks disagree

- **Revenue fleets (ride-hail, delivery, rental):** the fleet clock wins. Release on a loan vehicle or a partial fix rather than holding an earning asset for a perfect job, but never at the cost of a repeat repair (law 3) or a licence breach (law 6).
- **Customer-owned or leased vehicles:** the customer clock wins. Agree a key-back time at key-in, and treat a missed promise like a missed parts ETA.
- **Capacity crunch:** protect first-time fix before turnaround. A fast wrong repair runs every clock twice.
- **Supplier failure:** escalate on promises missed, not on lead time. A long but kept ETA can be planned around; a short broken one cannot.

## 7. How fleetkpi encodes the doctrine

| Doctrine element | Where it lives |
|---|---|
| Three clocks per work order | `sql/models/staging/stg_work_orders.sql` |
| Clock identity test | `sql/tests/t18_handover_clocks_consistent.sql` |
| Repeat logic (law 3) | `sql/models/intermediate/int_visits.sql` |
| Parts promises (law 4) | `sql/models/marts/mart_parts_eta.sql`, `mart_parts_open.sql` |
| Licence gate (law 6) | `mart_compliance_status.sql`, `mart_compliance_expiring.sql`, `mart_fines_*.sql` |
| Ledger | `mart_vehicle_service_spend.sql`, `mart_goodwill_monthly.sql`, `mart_asset_value_monthly.sql`, `mart_cost_monthly.sql` |
| Owners and deadlines (law 5) | `fleetkpi/sops/SOP-01` … `SOP-08` |
| Recognition (law 7) | `mart_site_scores.sql`, `mart_leaderboard.sql` |
| Targets for every rule | `fleet.yml` → `targets:` |

The dashboard's **Doctrine** page shows the three clocks live for your fleet.
