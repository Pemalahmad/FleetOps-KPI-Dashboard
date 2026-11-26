import { describe, expect, it } from "vitest";
import {
  bookValue, defaultAssumptions, energyPerKm, FALLBACK, observedGrowthPct, planVehicle, summarise,
  type Assumptions, type FleetInputs, type PowertrainStats, type VehicleHistory,
} from "./replace-plan";

const A: Assumptions = {
  horizonYears: 5, icePrice: 27000, evPrice: 42000, fuelPrice: 0.75, elecPrice: 0.12, iceLPer100: 10, evKwhPer100: 18,
  iceMaintKm: 0.05, evMaintKm: 0.03, maintGrowthPct: 0, usefulLifeYears: 5, residualPct: 20, method: "straight_line",
  minSavingPct: 10, minMonths: 6,
};

/** A petrol ride-hail car: 12 months observed, 70,000 km, 10 L/100 km, 0.06 maintenance per km, bought for 27,000. */
const car = (over: Partial<VehicleHistory> = {}): VehicleHistory => ({
  vehicle_id: "V1", make: "Sahra", model: "S1 Sedan Petrol", powertrain: "ICE", region: "UAE", age_months: 12,
  purchase_cost: 27000, km: 70000, days: 365.25, months: 12, depreciation: 4320, energy_cost: 5250,
  fuel_l: 7000, kwh: null, maintenance_cost: 4200, wear_cost: 4200, ...over,
});

const stat = (over: Partial<PowertrainStats>): PowertrainStats => ({
  powertrain: "ICE", l_per_100km: null, kwh_per_100km: null, maint_y1: 0, km_y1: 0, months_y1: 0, maint_y2: 0, km_y2: 0, months_y2: 0,
  avg_price: null, priced: 0, ...over,
});

describe("book value", () => {
  it("straight line falls to the residual at the end of the useful life and stays there", () => {
    expect(bookValue(10000, 0, A)).toBe(10000);
    expect(bookValue(10000, 30, A)).toBeCloseTo(6000);          // half the life: 10,000 - 8,000 / 2
    expect(bookValue(10000, 60, A)).toBeCloseTo(2000);
    expect(bookValue(10000, 120, A)).toBeCloseTo(2000);
    expect(bookValue(10000, -5, A)).toBe(10000);
  });
  it("declining balance reaches the same residual with a constant rate", () => {
    const d = { ...A, method: "declining_balance" as const };
    expect(bookValue(10000, 60, d)).toBeCloseTo(2000);
    expect(bookValue(10000, 30, d)).toBeCloseTo(10000 * Math.sqrt(0.2));
  });
});

describe("one vehicle", () => {
  const p = planVehicle(car(), A);
  it("works out distance per year and cost per km to date from what was observed", () => {
    expect(p.kmPerYear).toBeCloseTo(70000);
    expect(p.costPerKmToDate).toBeCloseTo((5250 + 4200 + 4320) / 70000);
  });
  it("prices keeping it: value lost plus energy and maintenance over the horizon", () => {
    // value now 27,000 - 21,600 * 12/60 = 22,680; in 5 years (72 months) it is at the residual, 5,400
    expect(p.resaleNow).toBeCloseTo(22680);
    expect(p.keep!.capital).toBeCloseTo(22680 - 5400);
    // 0.075 energy + 0.06 maintenance per km, 70,000 km a year, 5 years
    expect(p.keep!.running).toBeCloseTo(5 * 70000 * (0.075 + 0.06));
    expect(p.keep!.perKm).toBeCloseTo(p.keep!.total / 350000);
  });
  it("prices a new EV and a new petrol car the same way", () => {
    expect(p.ev!.capital).toBeCloseTo(42000 - 8400);
    expect(p.ev!.running).toBeCloseTo(5 * 70000 * (0.18 * 0.12 + 0.03));
    expect(p.ice!.capital).toBeCloseTo(27000 - 5400);
    expect(p.ice!.running).toBeCloseTo(5 * 70000 * (0.075 + 0.05));
  });
  it("recommends the cheaper replacement when it clears the threshold, with its break-even year", () => {
    // keep 17,280 + 47,250 = 64,530; EV 33,600 + 18,060 = 51,660: saves 12,870 (19.9 %)
    expect(p.best).toBe("ev");
    expect(p.saving).toBeCloseTo(12870);
    expect(p.decision).toBe("ev");
    // net capital 42,000 - 22,680 = 19,320; running saving 70,000 * (0.135 - 0.0516) = 5,838 a year: paid back in year 4
    expect(p.netCapital).toBeCloseTo(19320);
    expect(p.breakEvenYear).toBe(4);
    expect(p.reason).toMatch(/^Replacing with an EV saves 12,870 \(20 %\) over 5 years; pays back in year 4\.$/);
  });
  it("keeps the vehicle when the saving is under the threshold", () => {
    const q = planVehicle(car(), { ...A, minSavingPct: 25 });
    expect(q.decision).toBe("keep");
    expect(q.reason).toContain("under your 25 % threshold");
  });
  it("keeps the vehicle when replacing costs more", () => {
    const q = planVehicle(car({ maintenance_cost: 1400, wear_cost: 1400, fuel_l: 3500 }), { ...A, evPrice: 60000 });
    expect(q.saving!).toBeLessThan(0);
    expect(q.decision).toBe("keep");
    expect(q.reason).toMatch(/^Keeping costs [\d,]+ less over 5 years than replacing with/);
  });
  it("grows maintenance with age: year t of the old vehicle is (1 + g)^t, the new one starts at (1 + g)^0", () => {
    const q = planVehicle(car(), { ...A, maintGrowthPct: 10, horizonYears: 2 });
    expect(q.keep!.running).toBeCloseTo(70000 * (0.075 * 2 + 0.06 * (1.1 + 1.21)));
    expect(q.ev!.running).toBeCloseTo(70000 * (0.0216 * 2 + 0.03 * (1 + 1.1)));
  });
  it("says when a replacement does not pay back within the horizon", () => {
    const q = planVehicle(car(), { ...A, horizonYears: 3, minSavingPct: -100 });
    expect(q.breakEvenYear).toBeNull();
    expect(q.reason).toContain("does not pay back within 3 years");
  });
});

describe("collision repairs", () => {
  it("count in the cost to date but are not projected forward as wear", () => {
    const p = planVehicle(car({ maintenance_cost: 11200, wear_cost: 4200 }), A);
    expect(p.costPerKmToDate).toBeCloseTo((5250 + 11200 + 4320) / 70000);
    expect(p.keep!.running).toBeCloseTo(5 * 70000 * (0.075 + 0.06));
  });
});

describe("what goes to review", () => {
  it("a vehicle with no purchase cost", () => {
    const p = planVehicle(car({ purchase_cost: null }), A);
    expect(p.decision).toBe("review");
    expect(p.keep).toBeNull();
    expect(p.reason).toContain("No purchase cost");
  });
  it("a vehicle with too little history or no distance, without NaN", () => {
    expect(planVehicle(car({ months: 3 }), A).reason).toBe("Only 3 months of history; 6 are needed to judge it.");
    const none = planVehicle(car({ km: 0, depreciation: 0 }), A);
    expect(none.decision).toBe("review");
    expect(none.kmPerYear).toBeNull();
    expect(none.costPerKmToDate).toBeNull();
  });
});

describe("energy per km", () => {
  it("prices what the vehicle used, petrol and electricity together for a plug-in hybrid", () => {
    expect(energyPerKm(car({ powertrain: "PHEV", fuel_l: 2000, kwh: 7000 }), A)).toBeCloseTo((2000 * 0.75 + 7000 * 0.12) / 70000);
  });
  it("falls back to the fleet average for its powertrain when it has no energy records", () => {
    const stats = [stat({ powertrain: "BEV", kwh_per_100km: 20 })];
    expect(energyPerKm(car({ powertrain: "BEV", fuel_l: null, kwh: null }), A, stats)).toBeCloseTo(0.2 * 0.12);
  });
});

describe("defaults and their sources", () => {
  const full: FleetInputs = {
    stats: [
      stat({ powertrain: "ICE", l_per_100km: 9.93, maint_y1: 5800, km_y1: 100000, months_y1: 100, maint_y2: 6100, km_y2: 100000, months_y2: 100, avg_price: 26952.5, priced: 1291 }),
      stat({ powertrain: "BEV", kwh_per_100km: 18.34, maint_y1: 3000, km_y1: 100000, months_y1: 100, maint_y2: 3000, km_y2: 100000, months_y2: 100, avg_price: 42013.3, priced: 2917 }),
    ],
    fuelPrice: 0.78, elecPrice: 0.12, usefulLifeYears: 5, residualPct: 20, method: "straight_line",
  };
  it("comes from the fleet's own data and settings when they have it", () => {
    const { values, sources } = defaultAssumptions(full);
    expect(values.icePrice).toBe(26953);
    expect(values.evPrice).toBe(42013);
    expect(values.iceLPer100).toBe(9.93);
    expect(values.evKwhPer100).toBe(18.34);
    expect(values.iceMaintKm).toBe(0.058);
    expect(values.evMaintKm).toBe(0.03);
    expect(values.fuelPrice).toBe(0.78);
    expect(values.maintGrowthPct).toBe(3.4);         // (9,100 / 200,000) / (8,800 / 200,000) - 1
    expect(sources.icePrice.kind).toBe("data");
    expect(sources.fuelPrice.kind).toBe("settings");
    expect(sources.horizonYears.kind).toBe("assumption");
    expect(sources.icePrice.note).toContain("1,291");
  });
  it("marks placeholders when the fleet has no data for them", () => {
    const { values, sources } = defaultAssumptions({ stats: [], fuelPrice: null, elecPrice: null, usefulLifeYears: null, residualPct: null, method: null });
    expect(values.evPrice).toBe(FALLBACK.evPrice);
    expect(values.evKwhPer100).toBe(FALLBACK.evKwhPer100);
    for (const k of ["icePrice", "evPrice", "fuelPrice", "elecPrice", "iceMaintKm", "evMaintKm", "maintGrowthPct"] as const) expect(sources[k].kind).toBe("placeholder");
    expect(sources.evKwhPer100.note).toContain("fueleconomy.gov");
    expect(values.method).toBe("straight_line");
  });
  it("keeps the measured maintenance growth between 0 and 30 % and ignores thin history", () => {
    const s = (m2: number, n = 100) => [stat({ maint_y1: 1000, km_y1: 1000, months_y1: n, maint_y2: m2, km_y2: 1000, months_y2: n })];
    expect(observedGrowthPct(s(500))).toBe(0);
    expect(observedGrowthPct(s(5000))).toBe(30);
    expect(observedGrowthPct(s(1100))).toBe(10);
    expect(observedGrowthPct(s(1100, 10))).toBeNull();
  });
});

describe("fleet summary", () => {
  it("adds the capital and saving of recommended replacements only", () => {
    const plans = [planVehicle(car(), A), planVehicle(car({ vehicle_id: "V2" }), A), planVehicle(car({ vehicle_id: "V3", purchase_cost: null }), A),
      planVehicle(car({ vehicle_id: "V4" }), { ...A, minSavingPct: 50 })];
    const s = summarise(plans, A);
    expect(s.counts).toEqual({ keep: 1, ev: 2, ice: 0, review: 1 });
    expect(s.purchase).toBe(84000);
    expect(s.resale).toBeCloseTo(2 * 22680);
    expect(s.capital).toBeCloseTo(84000 - 45360);
    expect(s.saving).toBeCloseTo(2 * 12870);
  });
});
