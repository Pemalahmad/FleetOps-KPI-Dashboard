/**
 * Dispatch lab: a deterministic, seeded simulation that runs the same stream of jobs through different dispatch rules
 * so their KPIs can be compared fairly (common random numbers). Pure functions, no I/O; runs in the browser.
 *
 * Model (one operating day per run):
 * - Vehicles start and end the shift at a central depot. A job has a pickup, a drop, a ready time, an SLA deadline and
 *   a price. Distances are straight-line × a road-detour factor; speeds are average door-to-door speeds.
 * - Every minute, idle vehicles and waiting jobs are matched greedily: the best (vehicle, job) pair by the rule's score
 *   is assigned, then the next, until no feasible pair is left. A pair is feasible only if the vehicle can deliver and
 *   drive back to the depot before its shift ends. Jobs never assigned count as missed.
 * - Empty driving to each pickup and the final drive back to the depot are deadhead.
 */
import { lcg, type Rand } from "./live";
import { tCrit } from "./stats";

export type FleetKind = "van" | "bus" | "truck";
export type DispatchRule = "shortest" | "margin" | "deadhead" | "deadline";

export interface FleetProfile {
  label: string; unit: string;
  areaKm: number;          // side of the square service area
  speedKmh: number;        // average door-to-door speed
  loadMin: number; unloadMin: number;
  shiftMin: number;        // paid shift length
  jobsPerVehicle: number;  // demand per vehicle per shift at normal load
  tripKm: [number, number];
  slaMin: number;          // ready-to-delivered promise
  revenueBase: number; revenuePerKm: number;
  costPerKm: number;       // fuel or energy, tyres, maintenance
  driverPerHour: number;
}

export const FLEETS: Record<FleetKind, FleetProfile> = {
  van: { label: "Delivery vans", unit: "parcel route", areaKm: 30, speedKmh: 28, loadMin: 6, unloadMin: 8, shiftMin: 540, jobsPerVehicle: 9,
    tripKm: [2, 12], slaMin: 120, revenueBase: 16, revenuePerKm: 1.4, costPerKm: 0.35, driverPerHour: 14 },
  bus: { label: "Shuttle and charter buses", unit: "charter run", areaKm: 60, speedKmh: 40, loadMin: 10, unloadMin: 8, shiftMin: 600, jobsPerVehicle: 4,
    tripKm: [8, 40], slaMin: 150, revenueBase: 70, revenuePerKm: 2.6, costPerKm: 0.9, driverPerHour: 18 },
  truck: { label: "Commercial trucks", unit: "freight load", areaKm: 100, speedKmh: 55, loadMin: 35, unloadMin: 35, shiftMin: 660, jobsPerVehicle: 2.5,
    tripKm: [20, 90], slaMin: 360, revenueBase: 160, revenuePerKm: 3.2, costPerKm: 1.1, driverPerHour: 20 },
};

export const RULES: { id: DispatchRule; label: string; reference?: boolean; detail: string }[] = [
  { id: "shortest", label: "Shortest distance", detail: "Pairs the vehicle and job with the fewest total kilometres (empty to the pickup plus loaded to the drop)." },
  { id: "margin", label: "Highest margin", detail: "Pairs the vehicle and job with the best price minus distance and driver-time cost." },
  { id: "deadhead", label: "Least deadhead", detail: "Pairs the vehicle and job with the fewest empty kilometres to the pickup." },
  { id: "deadline", label: "Earliest deadline", reference: true, detail: "Reference rule: serves the job whose SLA deadline is soonest, from the nearest vehicle." },
];

const DETOUR = 1.3;
interface Point { x: number; y: number }
export interface Job { id: number; readyAt: number; deadline: number; pickup: Point; drop: Point; loadedKm: number; revenue: number }

export interface DayMetrics {
  jobs: number; served: number; onTime: number;
  onTimePct: number;        // SLA: delivered by the deadline, as a share of all jobs (missed jobs count against it)
  deadheadRatio: number;    // empty km / all km, including the drive back to the depot
  utilisation: number;      // productive minutes (loaded driving, loading, unloading) / paid shift minutes
  turnaroundMin: number;    // dispatch to delivered, per served job
  marginPerVehicle: number; // revenue − distance cost − paid driver shifts, per vehicle
  kmPerVehicle: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;
const between = (r: Rand, lo: number, hi: number) => lo + (hi - lo) * r();

/** The day's jobs depend only on the seed, fleet and demand, never on the rule: every rule sees the same jobs. */
export function generateJobs(kind: FleetKind, vehicles: number, demand: number, seed: number): Job[] {
  const f = FLEETS[kind], r = lcg(seed * 7919 + vehicles * 31 + Math.round(demand * 100));
  const hubs: Point[] = Array.from({ length: 4 }, () => ({ x: between(r, 0.15, 0.85) * f.areaKm, y: between(r, 0.15, 0.85) * f.areaKm }));
  const n = Math.max(1, Math.round(vehicles * f.jobsPerVehicle * demand * between(r, 0.9, 1.1)));
  const lastReady = f.shiftMin * 0.75;
  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    const hub = hubs[Math.floor(r() * hubs.length)];
    // Demand is lumpy: most pickups sit near a few hubs (warehouses, terminals, business districts), and many trips end
    // near another hub, which is what makes chaining jobs (and therefore the dispatch rule) matter.
    const near = (h: Point, spread: number) => ({ x: clamp(h.x + (r() - 0.5) * f.areaKm * spread, f.areaKm), y: clamp(h.y + (r() - 0.5) * f.areaKm * spread, f.areaKm) });
    const pickup = r() < 0.75 ? near(hub, 0.2) : { x: r() * f.areaKm, y: r() * f.areaKm };
    const angle = r() * Math.PI * 2, km = between(r, f.tripKm[0], f.tripKm[1]) / DETOUR;
    const drop = r() < 0.45 ? near(hubs[Math.floor(r() * hubs.length)], 0.2)
      : { x: clamp(pickup.x + Math.cos(angle) * km, f.areaKm), y: clamp(pickup.y + Math.sin(angle) * km, f.areaKm) };
    const readyAt = Math.floor(r() * lastReady);
    const loadedKm = dist(pickup, drop);
    jobs.push({ id: i, readyAt, deadline: readyAt + Math.round(f.slaMin * between(r, 0.8, 1.3)), pickup, drop, loadedKm,
      revenue: f.revenueBase + f.revenuePerKm * loadedKm });
  }
  return jobs.sort((a, b) => a.readyAt - b.readyAt || a.id - b.id);
}
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** Simulate one day under one rule. Deterministic for a given (jobs, rule, vehicles). */
export function simulateDay(kind: FleetKind, rule: DispatchRule, vehicles: number, jobs: Job[]): DayMetrics {
  const f = FLEETS[kind], perKmMin = 60 / f.speedKmh, driverPerMin = f.driverPerHour / 60;
  const depot = { x: f.areaKm / 2, y: f.areaKm / 2 };
  const fleet = Array.from({ length: vehicles }, (_, id) => ({ id, at: depot, freeAt: 0, emptyKm: 0, loadedKm: 0, productiveMin: 0 }));
  const waiting: Job[] = [];
  let next = 0, served = 0, onTime = 0, revenue = 0, turnaround = 0;
  for (let t = 0; t < f.shiftMin; t++) {
    while (next < jobs.length && jobs[next].readyAt <= t) waiting.push(jobs[next++]);
    let idle = fleet.filter((v) => v.freeAt <= t);
    while (idle.length && waiting.length) {
      let best: { v: (typeof fleet)[number]; j: Job; empty: number; score: number } | null = null;
      for (const v of idle) for (const j of waiting) {
        const empty = dist(v.at, j.pickup);
        const done = t + (empty + j.loadedKm) * perKmMin + f.loadMin + f.unloadMin;
        if (done + dist(j.drop, depot) * perKmMin > f.shiftMin) continue;   // must deliver and get back before the shift ends
        const minutes = done - t;
        const score = rule === "shortest" ? empty + j.loadedKm
          : rule === "deadhead" ? empty
          : rule === "margin" ? -(j.revenue - f.costPerKm * (empty + j.loadedKm) - driverPerMin * minutes)
          : j.deadline * 1000 + empty;   // earliest deadline, then nearest vehicle
        if (!best || score < best.score || (score === best.score && (j.readyAt < best.j.readyAt || (j.readyAt === best.j.readyAt && v.id < best.v.id))))
          best = { v, j, empty, score };
      }
      if (!best) break;
      const { v, j, empty } = best;
      const minutes = (empty + j.loadedKm) * perKmMin + f.loadMin + f.unloadMin;
      v.emptyKm += empty; v.loadedKm += j.loadedKm; v.productiveMin += j.loadedKm * perKmMin + f.loadMin + f.unloadMin; v.at = j.drop; v.freeAt = t + Math.ceil(minutes);
      served += 1; revenue += j.revenue; turnaround += minutes;
      if (t + minutes <= j.deadline) onTime += 1;
      waiting.splice(waiting.indexOf(j), 1);
      idle = idle.filter((x) => x !== v);
    }
  }
  for (const v of fleet) v.emptyKm += dist(v.at, depot);
  const empty = fleet.reduce((s, v) => s + v.emptyKm, 0), loaded = fleet.reduce((s, v) => s + v.loadedKm, 0);
  const productive = fleet.reduce((s, v) => s + v.productiveMin, 0);
  const margin = revenue - f.costPerKm * (empty + loaded) - f.driverPerHour * (f.shiftMin / 60) * vehicles;
  return {
    jobs: jobs.length, served, onTime,
    onTimePct: jobs.length ? onTime / jobs.length : 0,
    deadheadRatio: empty + loaded > 0 ? empty / (empty + loaded) : 0,
    utilisation: Math.min(1, productive / (vehicles * f.shiftMin)),
    turnaroundMin: served ? turnaround / served : 0,
    marginPerVehicle: margin / vehicles,
    kmPerVehicle: (empty + loaded) / vehicles,
  };
}

export interface Estimate { mean: number; half: number }   // mean ± 95% confidence half-width across simulated days
export type RuleResult = { rule: DispatchRule } & Record<keyof DayMetrics, Estimate>;

/** Run `days` simulated days per rule (the same days for every rule) and summarise each metric with a 95% CI. */
export function compareRules(kind: FleetKind, vehicles: number, demand: number, seed: number, days: number,
  rules: DispatchRule[] = RULES.map((r) => r.id)): RuleResult[] {
  const streams = Array.from({ length: days }, (_, d) => generateJobs(kind, vehicles, demand, seed + d));
  return rules.map((rule) => {
    const runs = streams.map((jobs) => simulateDay(kind, rule, vehicles, jobs));
    const keys = Object.keys(runs[0]) as (keyof DayMetrics)[];
    return { rule, ...Object.fromEntries(keys.map((k) => [k, estimate(runs.map((m) => m[k]))])) } as RuleResult;
  });
}

function estimate(xs: number[]): Estimate {
  const n = xs.length, mean = xs.reduce((s, x) => s + x, 0) / n;
  if (n < 2) return { mean, half: 0 };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  return { mean, half: tCrit(n - 1) * sd / Math.sqrt(n) };
}
