import { describe, expect, it } from "vitest";
import { backfill, DUTY_STATES, dutyAt, nextEvent, seed, type Cast, type LiveState } from "./live";

const cast: Cast = {
  vehicles: [{ id: "V1", plate: "A 1", model: "S1", site: "Dubai", powertrain: "BEV" }, { id: "V2", plate: "B 2", model: "X2", site: "Doha", powertrain: "ICE" }],
  drivers: [{ id: "D1", name: "Omar", plate: "A 1" }], active: 100, openJobs: 10,
};
const rng = (seedN: number) => () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };

describe("live demo feed", () => {
  it("starts from the fleet: open jobs in the workshop, most of the rest on the road", () => {
    const s = seed(cast, 1_000_000);
    expect(s.inWorkshop).toBe(10);
    expect(s.onRoad).toBe(Math.round(90 * 0.82));
    expect(s.series).toHaveLength(30);
  });
  it("keeps counters consistent and never negative over many events", () => {
    let s = { ...(seed(cast, 0) as LiveState), paused: false, follow: null } as LiveState;
    const r = rng(42);
    for (let i = 0; i < 500; i++) s = { ...s, ...nextEvent(s, cast, r, 1000 + i * 2000) };
    expect(s.onRoad).toBeGreaterThanOrEqual(0);
    expect(s.inWorkshop).toBeGreaterThanOrEqual(0);
    expect(s.openJobs).toBeGreaterThanOrEqual(0);
    expect(s.events.length).toBeLessThanOrEqual(40);
    expect(s.series.length).toBeLessThanOrEqual(60);
    expect(s.tripsToday).toBeGreaterThan(0);
    expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
  });
  it("does nothing without vehicles", () => {
    expect(nextEvent(seed(cast) as LiveState, { ...cast, vehicles: [] }, Math.random)).toEqual({});
  });
  it("starts the day under way: today's totals scale with the time of day, and the feed is pre-filled", () => {
    const noon = new Date(2026, 10, 19, 12, 0).getTime();
    const full: Cast = { ...cast, perDay: { trips: 1000, km: 32000, alerts: 40 }, staff: { active: 900, onLeave: 20, suspended: 10 } };
    const s = { ...(seed(full, noon) as LiveState), paused: false, follow: null } as LiveState;
    expect(s.tripsToday).toBe(375); // 6 of 16 working hours gone
    expect(s.kmToday).toBe(12000);
    const b = { ...s, ...backfill(s, full, noon) } as LiveState;
    expect(b.events).toHaveLength(8);
    expect(b.events.every((e) => e.at < noon)).toBe(true);
  });
  it("keeps every driver in exactly one duty state as the feed moves them", () => {
    const staff = { active: 900, onLeave: 20, suspended: 10 };
    const d = dutyAt(new Date(2026, 10, 19, 12, 0).getTime(), staff);
    const total = DUTY_STATES.reduce((n, k) => n + d[k], 0);
    expect(total).toBe(930);
    const full: Cast = { ...cast, drivers: Array.from({ length: 14 }, (_, i) => ({ id: "D" + i, name: "Driver " + i, plate: "P" + i, status: i === 3 ? "Suspended" : "Active" })), staff };
    let s = { ...(seed(full, 0) as LiveState), paused: false, follow: null } as LiveState;
    const r = rng(7);
    for (let i = 0; i < 400; i++) s = { ...s, ...nextEvent(s, full, r, 1000 + i * 2000) };
    expect(DUTY_STATES.reduce((n, k) => n + s.duty![k], 0)).toBe(930);
    expect(DUTY_STATES.every((k) => s.duty![k] >= 0)).toBe(true);
    expect(s.roster.find((x) => x.id === "D3")!.state).toBe("Suspended");
  });
});
