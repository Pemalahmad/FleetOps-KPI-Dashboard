import { describe, expect, it } from "vitest";
import { aggregate, ALPHA, EDGES, fitModels, HOURS_PER_MONTH, IDENTITIES, NODE, ORDER, type PanelRow, simulate } from "./metrics";

// Synthetic regions built so the panel identities hold, like mart_metric_panel (SQL test t21).
function row(region: string, i: number): PanelRow {
  const D = 3000 + 40 * i, J = 1500 + 13 * ((i * 7) % 11), rep = 0.05 + 0.002 * (i % 5);
  const w = 20 + (i % 7), p = 3 + (i % 3) * 0.4, b = 3.5 + (i % 4) * 0.2, o = 1 + (i % 2);
  const H = J * (w + p + b + o), spv = 450 + 3 * i;
  const prod = 75 + (i % 9), parts = 80 + (i % 6) * 2;
  return {
    region, month_start: `2026-0${(i % 9) + 1}-01`, active_vehicles: D / 30, vehicle_days: D, jobs: J, offroad_h: H,
    offroad_h_per_vehicle_month: (30.4375 * H) / D, visits_per_vehicle_month: (30.4375 * J) / D,
    first_visits_per_vehicle_month: (30.4375 * J * (1 - rep)) / D, repeat_share: rep, offroad_h_per_visit: H / J,
    workshop_h_per_visit: w, pickup_h_per_visit: p, back_to_ops_h_per_visit: b, open_h_per_visit: o,
    availability_exact_pct: 100 * (1 - H / (24 * D)), spend_per_visit: spv, spend_per_vehicle_month: (30.4375 * J * spv) / D,
    goodwill_share_pct: 1 + (i % 3) * 0.3, productivity_pct: prod, parts_on_time_pct: parts,
    repeat_repair_pct: 4 + (i % 4), key_to_key_p50_h: 0.5 * w + p + (i % 2) * 0.3, csat_pct: 95 - 0.4 * w,
    low_rating_pct: 2 + 0.1 * w, responses: 300, fines_per_100_vehicles: 12, recall_completion_pct: 90,
  };
}
const rows = Array.from({ length: 40 }, (_, i) => row(i % 2 ? "A" : "B", i));

describe("metric network", () => {
  it("is a DAG whose order puts every input before its output", () => {
    for (const e of EDGES) expect(ORDER.indexOf(e.source)).toBeLessThan(ORDER.indexOf(e.target));
    for (const e of EDGES) expect(NODE[e.source] && NODE[e.target]).toBeTruthy();
  });

  it("aggregation keeps every identity exact", () => {
    const v = aggregate(rows.slice(0, 2)) as Record<string, number>;
    for (const idn of IDENTITIES) expect(idn.eval(v)).toBeCloseTo(v[idn.output], 9);
  });

  it("zero lever changes return the baseline exactly", () => {
    const base = aggregate(rows);
    const sim = simulate(base, fitModels(rows), {});
    for (const [k, d] of Object.entries(sim.delta)) expect(Math.abs(d), k).toBeLessThan(1e-9);
  });

  it("one more pick-up hour per visit adds V hours to the north star, one hour to the customer clock, and only a significant effect to key-to-key", () => {
    const base = aggregate(rows) as Record<string, number>;
    const models = fitModels(rows);
    const sim = simulate(base, models, { pickup: 1 });
    expect(sim.delta.per_visit).toBeCloseTo(1, 9);
    expect(sim.delta.offroad).toBeCloseTo(base.visits, 9);
    expect(sim.delta.availability).toBeCloseTo((-100 * base.visits) / HOURS_PER_MONTH, 9);
    expect(sim.delta.customer_clock).toBeCloseTo(1, 9);
    const kk = models.find((m) => m.output === "key_to_key")!.fit!;
    expect(sim.delta.key_to_key).toBeCloseTo(kk.p[1] < ALPHA ? kk.coef[1] : 0, 9);
  });

  it("a lower comeback share cuts visits through V = V1 / (1 - rho)", () => {
    const base = aggregate(rows) as Record<string, number>;
    const sim = simulate(base, fitModels(rows), { repeat_share: -1 });
    expect(sim.values.visits).toBeCloseTo(base.first_visits / (1 - (base.repeat_share - 1) / 100), 9);
    expect(sim.delta.offroad).toBeLessThan(0);
  });
});

it("never propagates a non-significant driver", () => {
  const models = fitModels(rows).map((m) => ({ ...m, fit: m.fit && { ...m.fit, p: m.fit.p.map(() => 0.5) } }));
  const base = aggregate(rows);
  const sim = simulate(base, models, { productivity: 5, pickup: 1 });
  expect(Math.abs(sim.delta.workshop)).toBeLessThan(1e-9);
  expect(Math.abs(sim.delta.key_to_key)).toBeLessThan(1e-9);
});
