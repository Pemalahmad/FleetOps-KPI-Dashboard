# Dispatch lab

A simulation that runs the same day of jobs through different dispatch rules, so their trade-offs can be compared
fairly. It lives at **Operate → Dispatch lab** and in [`web/src/lib/dispatch-sim.ts`](../web/src/lib/dispatch-sim.ts),
with tests in `dispatch-sim.test.ts`. Everything runs in the browser; nothing is sent anywhere.

The figures are **simulated** to show how the rules behave. They are not a forecast for a real fleet.

## The model

- **One operating day per run.** Vehicles start and end their shift at a central depot. A job has a pickup, a drop, a
  ready time, a deadline (the SLA) and a price.
- **Lumpy demand.** Most pickups sit near a few hubs (warehouses, terminals, business districts) and many trips end
  near another hub, which is what makes chaining jobs, and therefore the rule, matter.
- **Distance and time.** Straight-line distance × 1.3 for the road network, at each fleet type's average speed, plus
  fixed loading and unloading minutes.
- **Dispatch.** Every minute, idle vehicles and waiting jobs are paired greedily: the best (vehicle, job) pair by the
  rule's score is assigned, then the next, until no feasible pair is left. A vehicle takes a job only if it can
  deliver it and drive back to the depot before its shift ends. Jobs never assigned count as late.
- **Fair comparison.** The day's jobs depend only on the seed, fleet and demand, never on the rule (common random
  numbers). Each rule runs 20 days; results are the mean with a 95% confidence interval.

| Fleet | Speed | Stops | Shift | SLA | Trip | Jobs per vehicle-day |
|---|---|---|---|---|---|---|
| Delivery vans | 28 km/h | 6 + 8 min | 9 h | 120 min | 2–12 km | 9 |
| Shuttle and charter buses | 40 km/h | 10 + 8 min | 10 h | 150 min | 8–40 km | 4 |
| Commercial trucks | 55 km/h | 35 + 35 min | 11 h | 360 min | 20–90 km | 2.5 |

## The rules

| Rule | Chooses the pair with |
|---|---|
| Shortest distance | the fewest total kilometres: empty to the pickup plus loaded to the drop |
| Highest margin | the best price minus distance cost and driver-time cost |
| Least deadhead | the fewest empty kilometres to the pickup |
| Earliest deadline (reference) | the soonest SLA deadline, then the nearest vehicle |

## The metrics

| Metric | Definition |
|---|---|
| SLA on-time delivery | jobs delivered by their deadline ÷ all jobs (missed jobs count as late) |
| Empty-mile (deadhead) ratio | empty km to pickups and back to the depot ÷ all km |
| Driver shift utilisation | productive minutes (driving loaded, loading, unloading) ÷ paid shift minutes; empty driving is not counted, so a rule cannot look busy by driving empty |
| Turnaround per job | dispatch to delivered: empty drive, loading, loaded drive, unloading |
| Margin per vehicle-day | revenue − distance cost − the paid driver shift, per vehicle |
| Jobs served per day | jobs completed before the shift ended |

## What it shows (delivery vans, 40 vehicles, peak demand)

- **Least deadhead** drives the fewest empty kilometres and, because empty kilometres are what a van cannot bill,
  also earns the most per vehicle and serves the most jobs.
- **Shortest distance** keeps the most deliveries on time.
- **Highest margin** chases long, well-paid jobs and loses on-time delivery: greedy one-job-at-a-time margin is not the
  same as the most margin over the day.
- **Earliest deadline** collapses under overload: it keeps sending vehicles across the map to jobs that are already late.
- At quiet demand the rules converge, because there is rarely more than one sensible choice. The rule matters most
  when demand outruns the fleet.

## Limits

One load per vehicle at a time, no multi-stop routes, no booked return loads, no traffic by time of day, no driver
breaks inside the shift, and greedy (not optimal) matching. Long-haul trucks therefore run about half their
kilometres empty, as one-way freight without backhaul does. These are deliberate simplifications so the rules'
behaviour stays easy to see; a production dispatcher would add routing and look-ahead.
