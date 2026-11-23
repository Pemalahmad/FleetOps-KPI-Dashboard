import { describe, expect, it } from "vitest";
import { FLEETS, compareRules, generateJobs, simulateDay, type DispatchRule, type FleetKind } from "./dispatch-sim";

const KINDS: FleetKind[] = ["van", "bus", "truck"];
const RULES: DispatchRule[] = ["shortest", "margin", "deadhead", "deadline"];

describe("dispatch lab simulation", () => {
  it("is deterministic: the same seed gives the same day", () => {
    expect(generateJobs("van", 20, 1, 7)).toEqual(generateJobs("van", 20, 1, 7));
    expect(compareRules("van", 20, 1, 7, 5)).toEqual(compareRules("van", 20, 1, 7, 5));
    expect(generateJobs("van", 20, 1, 8)).not.toEqual(generateJobs("van", 20, 1, 7));
  });

  it("gives every rule the same jobs (common random numbers)", () => {
    const res = compareRules("bus", 10, 1, 3, 4);
    expect(new Set(res.map((r) => r.jobs.mean)).size).toBe(1);
  });

  it("keeps every metric inside its bounds and never serves more jobs than exist", () => {
    for (const kind of KINDS) for (const rule of RULES) {
      const jobs = generateJobs(kind, 12, 1.3, 11), m = simulateDay(kind, rule, 12, jobs);
      expect(m.served).toBeLessThanOrEqual(m.jobs);
      expect(m.onTime).toBeLessThanOrEqual(m.served);
      for (const share of [m.onTimePct, m.deadheadRatio, m.utilisation]) { expect(share).toBeGreaterThanOrEqual(0); expect(share).toBeLessThanOrEqual(1); }
      expect(m.turnaroundMin).toBeGreaterThan(FLEETS[kind].loadMin + FLEETS[kind].unloadMin - 1e-9);
      expect(Number.isFinite(m.marginPerVehicle)).toBe(true);
    }
  });

  it("never plans work past the end of a shift", () => {
    // One van, many jobs late in the day: whatever is assigned must be delivered and the van back by the shift end.
    const jobs = generateJobs("van", 1, 4, 5).map((j) => ({ ...j, readyAt: Math.min(j.readyAt + 300, FLEETS.van.shiftMin - 1) }));
    const m = simulateDay("van", "shortest", 1, jobs);
    expect(m.utilisation).toBeLessThanOrEqual(1);
    expect(m.served).toBeLessThan(jobs.length);
  });

  it("the least-deadhead rule drives the fewest empty kilometres at peak demand", () => {
    const res = Object.fromEntries(compareRules("van", 40, 1.3, 7, 12).map((r) => [r.rule, r]));
    expect(res.deadhead.deadheadRatio.mean).toBeLessThan(res.shortest.deadheadRatio.mean);
    expect(res.deadhead.deadheadRatio.mean).toBeLessThan(res.deadline.deadheadRatio.mean);
  });

  it("reports a 95% interval that narrows with more simulated days", () => {
    const few = compareRules("van", 20, 1, 7, 4, ["shortest"])[0], many = compareRules("van", 20, 1, 7, 24, ["shortest"])[0];
    expect(few.onTimePct.half).toBeGreaterThan(0);
    expect(many.onTimePct.half).toBeLessThan(few.onTimePct.half);
  });

  it("handles a tiny fleet and a single day without NaN", () => {
    const [r] = compareRules("truck", 1, 0.5, 1, 1, ["margin"]);
    for (const k of Object.keys(r) as (keyof typeof r)[]) if (k !== "rule") expect(Number.isFinite((r[k] as { mean: number }).mean)).toBe(true);
  });
});
