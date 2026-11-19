/**
 * The live layer: a small store of incoming events and running counters that the dashboards read.
 *
 * Two sources feed it:
 * - "demo": a simulated feed generated in the browser from the demo fleet's own vehicles, drivers and sites, so the demo
 *   behaves like a fleet in motion. It is labelled as simulated wherever it shows.
 * - "file": the owner's own export, followed on disk (File System Access API). When the file changes it is re-imported
 *   with the mapping already confirmed, and the warehouse rebuilds. Nothing leaves the device.
 */
export type LiveKind = "trip" | "workshop_in" | "ready" | "handover" | "energy" | "fine" | "alert" | "shift" | "file";
export interface LiveEvent { id: number; at: number; kind: LiveKind; text: string; detail?: string; tone?: "bad" | "warn" | "good" }
export interface LivePoint { t: number; onRoad: number; inWorkshop: number; perMin: number }

/** What a driver is doing right now. "On leave" and "Suspended" come from the driver file; the rest move with the feed. */
export type DutyState = "On a trip" | "Available" | "On a break" | "Off duty" | "On leave" | "Suspended";
export const DUTY_STATES: DutyState[] = ["On a trip", "Available", "On a break", "Off duty", "On leave", "Suspended"];
export type Duty = Record<DutyState, number>;
export interface RosterEntry { id: string; name: string; plate: string | null; site: string | null; state: DutyState; since: number }

export interface LiveState {
  source: "demo" | "file" | null;
  paused: boolean;
  events: LiveEvent[];
  onRoad: number; inWorkshop: number; openJobs: number; kmToday: number; alertsToday: number; tripsToday: number;
  series: LivePoint[];
  duty: Duty | null;
  roster: RosterEntry[];
  follow: { name: string; checkedAt: number | null; changedAt: number | null; rebuilds: number; error: string | null } | null;
}
export interface Cast {
  vehicles: { id: string; plate: string; model: string; site: string; powertrain: string | null }[];
  drivers: { id: string; name: string; plate: string | null; site?: string | null; status?: string | null }[];
  active: number; openJobs: number;
  /** Daily averages from the fleet's own trips, so "today" starts where a real day would be. */
  perDay?: { trips: number; km: number; alerts: number };
  /** Driver headcount by file status. */
  staff?: { active: number; onLeave: number; suspended: number };
}

const initial = (): LiveState => ({
  source: null, paused: false, events: [], onRoad: 0, inWorkshop: 0, openJobs: 0, kmToday: 0, alertsToday: 0, tripsToday: 0,
  series: [], duty: null, roster: [], follow: null,
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
/** A small repeatable generator for seeding. */
export function lcg(seedN: number): Rand {
  let x = (Math.abs(Math.floor(seedN)) % 2147483646) + 1;
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}

/** Share of a working day gone by at this local time (06:00 → 0, 22:00 → 1). */
export function dayShare(now: number): number {
  const d = new Date(now), h = d.getHours() + d.getMinutes() / 60;
  return Math.min(1, Math.max(0.15, (h - 6) / 16));
}

/** How the active drivers split across duty states at this hour. */
export function dutyAt(now: number, staff: { active: number; onLeave: number; suspended: number }): Duty {
  const h = new Date(now).getHours(), peak = h >= 7 && h < 21;
  const a = staff.active;
  const onTrip = Math.round(a * (peak ? 0.52 : 0.18)), available = Math.round(a * (peak ? 0.17 : 0.08)), onBreak = Math.round(a * (peak ? 0.07 : 0.02));
  return { "On a trip": onTrip, Available: available, "On a break": onBreak, "Off duty": Math.max(0, a - onTrip - available - onBreak), "On leave": staff.onLeave, Suspended: staff.suspended };
}

const STATE_FOR = (r: number): DutyState => (r < 0.55 ? "On a trip" : r < 0.75 ? "Available" : r < 0.85 ? "On a break" : "Off duty");

/** The demo's starting picture: most active vehicles on the road, the open jobs in the workshop, the day already under way. */
export function seed(cast: Cast, now = Date.now()): Partial<LiveState> {
  const inWorkshop = cast.openJobs, onRoad = Math.round((cast.active - inWorkshop) * 0.82);
  const r = lcg(now), share = dayShare(now), per = cast.perDay;
  const staff = cast.staff ?? { active: cast.drivers.length, onLeave: 0, suspended: 0 };
  const roster: RosterEntry[] = cast.drivers.slice(0, 12).map((d) => ({
    id: d.id, name: d.name, plate: d.plate, site: d.site ?? null,
    state: d.status === "Suspended" ? "Suspended" : d.status === "On leave" ? "On leave" : STATE_FOR(r()),
    since: now - Math.round(r() * 90) * 60_000,
  }));
  return {
    source: "demo", onRoad, inWorkshop, openJobs: cast.openJobs, events: [],
    kmToday: per ? Math.round(per.km * share) : 0, tripsToday: per ? Math.round(per.trips * share) : 0, alertsToday: per ? Math.round(per.alerts * share) : 0,
    duty: dutyAt(now, staff), roster,
    // the last few minutes, wobbling like a real fleet rather than a flat line
    series: Array.from({ length: 30 }, (_, i) => ({ t: now - (30 - i) * 2500, onRoad: onRoad + Math.round((r() - 0.5) * 6), inWorkshop: inWorkshop + Math.round((r() - 0.5) * 2), perMin: 6 + Math.round(r() * 10) })),
  };
}

/** Move one roster driver to a new duty state, keeping the headcount by state in step. */
function move(s: LiveState, id: string | undefined, to: DutyState, now: number): Partial<LiveState> {
  const i = s.roster.findIndex((x) => x.id === id);
  if (i < 0 || !s.duty) return {};
  const from = s.roster[i].state;
  if (from === to || from === "Suspended" || from === "On leave") return {};
  const duty = { ...s.duty };
  if (duty[from] > 0) { duty[from]--; duty[to]++; }
  const roster = s.roster.slice(); roster[i] = { ...roster[i], state: to, since: now };
  return { duty, roster };
}

/** One simulated event from the demo fleet, and the counters it moves. */
export function nextEvent(s: LiveState, cast: Cast, r: Rand, now = Date.now()): Partial<LiveState> {
  if (!cast.vehicles.length) return {};
  const v = pick(cast.vehicles, r);
  const rosterPick = s.roster.length && r() < 0.6 ? pick(s.roster.filter((x) => x.state !== "Suspended" && x.state !== "On leave"), r) : undefined;
  const d = rosterPick ?? pick(cast.drivers, r) ?? { id: "", name: "A driver", plate: v.plate };
  const roll = r();
  const ev = (kind: LiveKind, text: string, detail?: string, tone?: LiveEvent["tone"]): LiveEvent => ({ id: ++seq, at: now, kind, text, detail, tone });
  let e: LiveEvent, patch: Partial<LiveState> = {};
  if (roll < 0.34) {
    const km = Math.round(20 + r() * 240), sp = r() < 0.12 ? 1 + Math.floor(r() * 3) : 0;
    e = ev("trip", `${d.name} finished a trip`, `${d.plate ?? v.plate} · ${km} km${sp ? ` · ${sp} speeding` : ""}`, sp ? "warn" : undefined);
    patch = { kmToday: s.kmToday + km, tripsToday: s.tripsToday + 1, ...move(s, rosterPick?.id, "Available", now) };
  } else if (roll < 0.44) {
    const to: DutyState = r() < 0.6 ? "On a trip" : r() < 0.7 ? "On a break" : "Off duty";
    e = ev("shift", to === "On a trip" ? `${d.name} started a trip` : to === "On a break" ? `${d.name} is on a break` : `${d.name} ended the shift`,
      `${d.plate ?? v.plate}`, to === "On a trip" ? "good" : undefined);
    patch = move(s, rosterPick?.id, to, now);
  } else if (roll < 0.53) {
    e = ev("workshop_in", `${v.plate} checked in for service`, `${v.model} · ${v.site}`);
    patch = { onRoad: Math.max(0, s.onRoad - 1), inWorkshop: s.inWorkshop + 1, openJobs: s.openJobs + 1 };
  } else if (roll < 0.62) {
    e = ev("ready", `${v.plate} is ready for pick-up`, `${v.site}`, "good");
  } else if (roll < 0.72) {
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

/** Fill the feed with the last few minutes of events, so the dashboards never open on an empty list. */
export function backfill(s: LiveState, cast: Cast, now = Date.now(), n = 8): Partial<LiveState> {
  let cur = s;
  const r = lcg(now + 7);
  for (let i = n; i > 0; i--) cur = { ...cur, ...nextEvent(cur, cast, r, now - i * 20_000) };
  return { events: cur.events, kmToday: cur.kmToday, tripsToday: cur.tripsToday, alertsToday: cur.alertsToday, onRoad: cur.onRoad,
    inWorkshop: cur.inWorkshop, openJobs: cur.openJobs, duty: cur.duty, roster: cur.roster, series: cur.series.slice(-60) };
}

/** A file event for the followed export. */
export function fileEvent(text: string, detail: string, tone?: LiveEvent["tone"], now = Date.now()): LiveEvent {
  return { id: ++seq, at: now, kind: "file", text, detail, tone };
}
