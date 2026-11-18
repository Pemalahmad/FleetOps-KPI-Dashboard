import { describe, expect, it } from "vitest";
import { nextEvent, seed, type Cast, type LiveState } from "./live";

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
});
