/**
 * The live layer: a small store of incoming events and running counters that the dashboards read.
 *
 * Two sources feed it:
 * - "demo": a simulated feed generated in the browser from the demo fleet's own vehicles, drivers and sites, so the demo
 *   behaves like a fleet in motion. It is labelled as simulated wherever it shows.
 * - "file": the owner's own export, followed on disk (File System Access API). When the file changes it is re-imported
 *   with the mapping already confirmed, and the warehouse rebuilds. Nothing leaves the device.
 */
export type LiveKind = "trip" | "workshop_in" | "ready" | "handover" | "energy" | "fine" | "alert" | "file";
export interface LiveEvent { id: number; at: number; kind: LiveKind; text: string; detail?: string; tone?: "bad" | "warn" | "good" }
export interface LivePoint { t: number; onRoad: number; inWorkshop: number; perMin: number }
export interface LiveState {
  source: "demo" | "file" | null;
  paused: boolean;
  events: LiveEvent[];
  onRoad: number; inWorkshop: number; openJobs: number; kmToday: number; alertsToday: number; tripsToday: number;
  series: LivePoint[];
  follow: { name: string; checkedAt: number | null; changedAt: number | null; rebuilds: number; error: string | null } | null;
}
export interface Cast {
  vehicles: { id: string; plate: string; model: string; site: string; powertrain: string | null }[];
  drivers: { id: string; name: string; plate: string | null }[];
  active: number; openJobs: number;
}

const initial = (): LiveState => ({
  source: null, paused: false, events: [], onRoad: 0, inWorkshop: 0, openJobs: 0, kmToday: 0, alertsToday: 0, tripsToday: 0, series: [], follow: null,
});
let state: LiveState = initial();
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const liveStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  set(patch: Partial<LiveState>) { state = { ...state, ...patch }; emit(); },
  reset() { state = initial(); emit(); },
};

/** Seeded random so tests are repeatable; the live feed passes Math.random. */
export type Rand = () => number;
const pick = <T,>(xs: T[], r: Rand) => xs[Math.floor(r() * xs.length)];

/** The demo's starting picture: most active vehicles on the road, the open jobs in the workshop. */
export function seed(cast: Cast, now = Date.now()): Partial<LiveState> {
  const inWorkshop = cast.openJobs, onRoad = Math.round((cast.active - inWorkshop) * 0.82);
  return { source: "demo", onRoad, inWorkshop, openJobs: cast.openJobs, kmToday: 0, alertsToday: 0, tripsToday: 0, events: [],
    series: Array.from({ length: 30 }, (_, i) => ({ t: now - (30 - i) * 2500, onRoad, inWorkshop, perMin: 0 })) };
}

/** One simulated event from the demo fleet, and the counters it moves. */
export function nextEvent(s: LiveState, cast: Cast, r: Rand, now = Date.now()): Partial<LiveState> {
  if (!cast.vehicles.length) return {};
  const v = pick(cast.vehicles, r), d = pick(cast.drivers, r) ?? { name: "A driver", plate: v.plate };
  const roll = r();
  const ev = (kind: LiveKind, text: string, detail?: string, tone?: LiveEvent["tone"]): LiveEvent => ({ id: ++seq, at: now, kind, text, detail, tone });
  let e: LiveEvent, patch: Partial<LiveState> = {};
  if (roll < 0.38) {
    const km = Math.round(20 + r() * 240), sp = r() < 0.12 ? 1 + Math.floor(r() * 3) : 0;
    e = ev("trip", `${d.name} finished a trip`, `${d.plate ?? v.plate} · ${km} km${sp ? ` · ${sp} speeding` : ""}`, sp ? "warn" : undefined);
    patch = { kmToday: s.kmToday + km, tripsToday: s.tripsToday + 1 };
  } else if (roll < 0.50) {
    e = ev("workshop_in", `${v.plate} checked in for service`, `${v.model} · ${v.site}`);
    patch = { onRoad: Math.max(0, s.onRoad - 1), inWorkshop: s.inWorkshop + 1, openJobs: s.openJobs + 1 };
  } else if (roll < 0.60) {
    e = ev("ready", `${v.plate} is ready for pick-up`, `${v.site}`, "good");
  } else if (roll < 0.71) {
    e = ev("handover", `${v.plate} handed back to the road`, `${v.model} · ${v.site}`, "good");
    patch = { onRoad: s.onRoad + 1, inWorkshop: Math.max(0, s.inWorkshop - 1), openJobs: Math.max(0, s.openJobs - 1) };
  } else if (roll < 0.86) {
    const electric = v.powertrain === "BEV" || (v.powertrain === "PHEV" && r() < 0.5);
    e = ev("energy", electric ? `${v.plate} charged` : `${v.plate} refuelled`, electric ? `${Math.round(18 + r() * 52)} kWh` : `${Math.round(25 + r() * 35)} L`);
  } else if (roll < 0.91) {
    e = ev("fine", `Fine registered on ${v.plate}`, `${pick(["Speeding", "Parking", "Toll", "Red light"], r)} · ${d.name}`, "warn");
  } else {
    const what = pick(["Speeding over the limit", "Harsh braking", "Left the permitted zone", "Long idling"], r);
    e = ev("alert", what, `${d.plate ?? v.plate} · ${d.name}`, what.startsWith("Left") ? "bad" : "warn");
    patch = { alertsToday: s.alertsToday + 1 };
  }
  const events = [e, ...s.events].slice(0, 40);
  const perMin = events.filter((x) => now - x.at < 60_000).length;
  const next = { ...s, ...patch };
  const series = [...s.series, { t: now, onRoad: next.onRoad, inWorkshop: next.inWorkshop, perMin }].slice(-60);
  return { ...patch, events, series };
}

/** A file event for the followed export. */
export function fileEvent(text: string, detail: string, tone?: LiveEvent["tone"], now = Date.now()): LiveEvent {
  return { id: ++seq, at: now, kind: "file", text, detail, tone };
}
