// Replace-or-keep planner: per-vehicle cost of ownership and when replacing it (with a petrol or an electric vehicle)
// costs less than keeping it. Pure functions, no I/O: the page feeds in rows from the warehouse and the owner's
// assumptions, so every number can be recomputed and tested. Each formula here is listed on the page under
// "How this is calculated"; keep the two in step.

export type Method = "straight_line" | "declining_balance";

/** One active vehicle and what the warehouse has observed for it (int_vehicle_months + energy + fleet-paid work orders). */
export interface VehicleHistory {
  vehicle_id: string;
  make: string | null;
  model: string | null;
  powertrain: string;              // BEV | PHEV | HEV | ICE
  region: string | null;
  age_months: number;
  purchase_cost: number | null;
  km: number;                      // observed distance
  days: number;                    // observed days in service
  months: number;                  // observed months in service
  depreciation: number;            // book value lost over the observed months (fleet settings)
  energy_cost: number | null;      // as paid, observed months
  fuel_l: number | null;           // litres, observed months
  kwh: number | null;              // kWh, observed months
  maintenance_cost: number;        // fleet-paid work orders, observed months
  wear_cost: number;               // the same without collision repairs: what is projected forward
}

/** Fleet figures the defaults come from, per powertrain, plus the depreciation settings in fleet.yml. */
export interface PowertrainStats {
  powertrain: string;
  l_per_100km: number | null;
  kwh_per_100km: number | null;
  maint_y1: number; km_y1: number; months_y1: number;   // vehicles in their first year: fleet-paid work without collisions
  maint_y2: number; km_y2: number; months_y2: number;   // vehicles in their second year
  avg_price: number | null; priced: number;              // average purchase cost in the register, and how many
}
export interface FleetInputs {
  stats: PowertrainStats[];
  fuelPrice: number | null;        // per litre, fleet settings (region row, else default row)
  elecPrice: number | null;        // per kWh
  usefulLifeYears: number | null;
  residualPct: number | null;
  method: string | null;
}

export interface Assumptions {
  horizonYears: number;
  icePrice: number;                // price of a new petrol replacement
  evPrice: number;                 // price of a new electric replacement
  fuelPrice: number;               // per litre
  elecPrice: number;               // per kWh
  iceLPer100: number;              // new petrol vehicle, litres per 100 km
  evKwhPer100: number;             // new electric vehicle, kWh per 100 km
  iceMaintKm: number;              // new petrol vehicle, maintenance per km in year 1
  evMaintKm: number;               // new electric vehicle, maintenance per km in year 1
  maintGrowthPct: number;          // maintenance per km grows this much each year of age
  usefulLifeYears: number;
  residualPct: number;             // value left at the end of the useful life
  method: Method;
  minSavingPct: number;            // replace only when it saves at least this share of the cost of keeping
  minMonths: number;               // less history than this is "Review"
}
export type AssumptionKey = keyof Assumptions;

/** Where a default came from. "placeholder" means the fleet has no data for it: the owner should enter their own. */
export type SourceKind = "data" | "settings" | "assumption" | "placeholder";
export interface AssumptionSource { kind: SourceKind; note: string }

/** Placeholders used only when the fleet's own data and settings have nothing to offer. */
export const FALLBACK = {
  horizonYears: 5,
  icePrice: 27000,
  evPrice: 42000,
  fuelPrice: 0.75,
  elecPrice: 0.12,
  iceLPer100: 8,       // about 29 mpg (US): a mid-size petrol car's combined rating on fueleconomy.gov (US EPA)
  evKwhPer100: 18,     // about 29 kWh/100 mi: a compact electric car's combined rating on fueleconomy.gov (US EPA)
  iceMaintKm: 0.05,
  evMaintKm: 0.03,
  maintGrowthPct: 8,
  usefulLifeYears: 5,
  residualPct: 20,
  minSavingPct: 10,
  minMonths: 6,
} as const;

const pos = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Maintenance growth seen in the fleet: year-2 vehicles' maintenance per km against year-1 vehicles', pooled. */
export function observedGrowthPct(stats: PowertrainStats[]): number | null {
  const s = stats.reduce((a, r) => ({ m1: a.m1 + r.maint_y1, k1: a.k1 + r.km_y1, n1: a.n1 + r.months_y1, m2: a.m2 + r.maint_y2, k2: a.k2 + r.km_y2, n2: a.n2 + r.months_y2 }),
    { m1: 0, k1: 0, n1: 0, m2: 0, k2: 0, n2: 0 });
  if (s.n1 < 60 || s.n2 < 60 || !pos(s.k1) || !pos(s.k2) || !pos(s.m1)) return null;   // too few vehicle-months to tell
  const g = (s.m2 / s.k2) / (s.m1 / s.k1) - 1;
  return round(Math.min(Math.max(g * 100, 0), 30), 1);
}

/** The defaults, each with its source. Fleet data first, then fleet settings, then a marked placeholder. */
export function defaultAssumptions(f: FleetInputs): { values: Assumptions; sources: Record<AssumptionKey, AssumptionSource> } {
  const by = (p: string) => f.stats.find((s) => s.powertrain === p);
  const ice = by("ICE"), ev = by("BEV");
  const sources = {} as Record<AssumptionKey, AssumptionSource>;
  const values = {} as Record<AssumptionKey, number | Method>;
  const set = <K extends AssumptionKey>(k: K, v: Assumptions[K], kind: SourceKind, note: string) => { values[k] = v; sources[k] = { kind, note }; };
  const yearOne = (s: PowertrainStats | undefined) => s && s.months_y1 >= 30 && pos(s.km_y1) ? s.maint_y1 / s.km_y1 : null;

  set("horizonYears", FALLBACK.horizonYears, "assumption", "Planning default: how many years ahead each option is priced. Set it to how long you would keep a replacement.");
  if (pos(ice?.avg_price)) set("icePrice", Math.round(ice.avg_price), "data", `Average purchase cost of ${ice.priced.toLocaleString()} petrol (ICE) vehicles in your register.`);
  else set("icePrice", FALLBACK.icePrice, "placeholder", "No petrol vehicle in the register has a purchase cost. Enter a dealer quote.");
  if (pos(ev?.avg_price)) set("evPrice", Math.round(ev.avg_price), "data", `Average purchase cost of ${ev.priced.toLocaleString()} electric (BEV) vehicles in your register.`);
  else set("evPrice", FALLBACK.evPrice, "placeholder", "No electric vehicle in the register has a purchase cost. Enter a dealer quote.");
  if (pos(f.fuelPrice)) set("fuelPrice", f.fuelPrice, "settings", "Fuel price in your fleet settings (energy.default_prices or this region's price).");
  else set("fuelPrice", FALLBACK.fuelPrice, "placeholder", "No fuel price in the settings. Enter what you pay per litre.");
  if (pos(f.elecPrice)) set("elecPrice", f.elecPrice, "settings", "Electricity price in your fleet settings (energy.default_prices or this region's price).");
  else set("elecPrice", FALLBACK.elecPrice, "placeholder", "No electricity price in the settings. Enter what you pay per kWh.");
  if (pos(ice?.l_per_100km)) set("iceLPer100", round(ice.l_per_100km, 2), "data", "What your petrol (ICE) vehicles used, from the energy file.");
  else set("iceLPer100", FALLBACK.iceLPer100, "assumption", "About 29 mpg (US), a mid-size petrol car's combined rating on fueleconomy.gov (US EPA).");
  if (pos(ev?.kwh_per_100km)) set("evKwhPer100", round(ev.kwh_per_100km, 2), "data", "What your electric (BEV) vehicles used, from the energy file.");
  else set("evKwhPer100", FALLBACK.evKwhPer100, "assumption", "About 29 kWh/100 mi, a compact electric car's combined rating on fueleconomy.gov (US EPA).");
  const iceM = yearOne(ice), evM = yearOne(ev);
  if (iceM !== null) set("iceMaintKm", round(iceM, 4), "data", "Fleet-paid maintenance per km (collisions left out) of your petrol vehicles in their first year.");
  else set("iceMaintKm", FALLBACK.iceMaintKm, "placeholder", "Too few first-year petrol vehicles to measure. Enter your workshop's figure.");
  if (evM !== null) set("evMaintKm", round(evM, 4), "data", "Fleet-paid maintenance per km (collisions left out) of your electric vehicles in their first year.");
  else set("evMaintKm", FALLBACK.evMaintKm, "placeholder", "Too few first-year electric vehicles to measure. Enter your workshop's figure.");
  const g = observedGrowthPct(f.stats);
  if (g !== null) set("maintGrowthPct", g, "data", "Second-year vehicles' maintenance per km against first-year vehicles' in your fleet (kept between 0 and 30 %).");
  else set("maintGrowthPct", FALLBACK.maintGrowthPct, "placeholder", "Too little history to measure how maintenance rises with age. Enter your own.");
  if (pos(f.usefulLifeYears)) set("usefulLifeYears", f.usefulLifeYears, "settings", "assets.useful_life_years in your fleet settings.");
  else set("usefulLifeYears", FALLBACK.usefulLifeYears, "assumption", "Default useful life.");
  if (typeof f.residualPct === "number" && Number.isFinite(f.residualPct)) set("residualPct", f.residualPct, "settings", "assets.residual_value_pct in your fleet settings.");
  else set("residualPct", FALLBACK.residualPct, "assumption", "Default value left at the end of the useful life.");
  set("method", f.method === "declining_balance" ? "declining_balance" : "straight_line", f.method ? "settings" : "assumption", f.method ? "assets.depreciation_method in your fleet settings." : "Default depreciation curve.");
  set("minSavingPct", FALLBACK.minSavingPct, "assumption", "Decision rule: smaller savings are within the error of these estimates, so the vehicle is kept.");
  set("minMonths", FALLBACK.minMonths, "assumption", "Decision rule: less history than this is too little to judge a vehicle on.");
  return { values: values as unknown as Assumptions, sources };
}

/** Book value after `ageMonths`, the same curve as the warehouse's book_value() macro. */
export function bookValue(cost: number, ageMonths: number, a: Pick<Assumptions, "usefulLifeYears" | "residualPct" | "method">): number {
  const share = Math.min(Math.max(ageMonths, 0) / (a.usefulLifeYears * 12), 1);
  if (a.method === "declining_balance") return cost * (a.residualPct / 100) ** share;
  return cost - cost * (1 - a.residualPct / 100) * share;
}

export type Decision = "keep" | "ev" | "ice" | "review";
export const DECISION_WORD: Record<Decision, string> = { keep: "Keep", ev: "Replace with EV", ice: "Replace with ICE", review: "Review" };

export interface OptionCost {
  capital: number;       // value lost over the horizon: price (or resale value now) minus value at the end
  running: number;       // energy + maintenance over the horizon
  total: number;
  perKm: number | null;
  cumulativeRunning: number[];   // running cost to the end of year 1..N
}
export interface VehiclePlan {
  id: string;
  name: string;
  powertrain: string;
  region: string | null;
  ageMonths: number;
  kmPerYear: number | null;
  costPerKmToDate: number | null;
  resaleNow: number | null;
  keep: OptionCost | null;
  ice: OptionCost | null;
  ev: OptionCost | null;
  best: "ice" | "ev" | null;     // the cheaper replacement
  saving: number | null;         // keep total minus best replacement total, over the horizon
  savingPct: number | null;
  netCapital: number | null;     // best replacement price minus resale now
  breakEvenYear: number | null;  // first year the running saving has paid back the net capital
  decision: Decision;
  reason: string;
}

const option = (capital: number, yearly: number[], kmPerYear: number): OptionCost => {
  const cumulativeRunning: number[] = [];
  yearly.reduce((sum, v) => { cumulativeRunning.push(sum + v); return sum + v; }, 0);
  const running = cumulativeRunning.at(-1) ?? 0, total = capital + running, km = kmPerYear * yearly.length;
  return { capital, running, total, perKm: km > 0 ? total / km : null, cumulativeRunning };
};

/** Energy per km for this vehicle at the assumed prices, from what it actually used. */
export function energyPerKm(v: VehicleHistory, a: Assumptions, stats: PowertrainStats[] = []): number {
  if (v.km > 0 && (v.fuel_l !== null || v.kwh !== null)) return ((v.fuel_l ?? 0) * a.fuelPrice + (v.kwh ?? 0) * a.elecPrice) / v.km;
  const s = stats.find((x) => x.powertrain === v.powertrain);   // no energy records: the fleet average for its powertrain
  return ((s?.l_per_100km ?? 0) * a.fuelPrice + (s?.kwh_per_100km ?? 0) * a.elecPrice) / 100;
}

export function planVehicle(v: VehicleHistory, a: Assumptions, money: (n: number) => string = (n) => Math.round(n).toLocaleString(), stats: PowertrainStats[] = []): VehiclePlan {
  const N = Math.max(1, Math.round(a.horizonYears));
  const g = a.maintGrowthPct / 100;
  const kmPerYear = v.days > 0 && v.km > 0 ? (v.km / v.days) * 365.25 : null;
  const costPerKmToDate = v.km > 0 ? ((v.energy_cost ?? 0) + v.maintenance_cost + v.depreciation) / v.km : null;
  const name = [v.make, v.model].filter(Boolean).join(" ");
  const base = { id: v.vehicle_id, name, powertrain: v.powertrain, region: v.region, ageMonths: v.age_months, kmPerYear, costPerKmToDate };
  const review = (reason: string): VehiclePlan => ({ ...base, resaleNow: null, keep: null, ice: null, ev: null, best: null, saving: null,
    savingPct: null, netCapital: null, breakEvenYear: null, decision: "review", reason });
  if (!pos(v.purchase_cost)) return review("No purchase cost in the register, so its value today is unknown.");
  if (kmPerYear === null) return review("No distance recorded, so its cost per km cannot be worked out.");
  if (v.months < a.minMonths) return review(`Only ${v.months} month${v.months === 1 ? "" : "s"} of history; ${a.minMonths} are needed to judge it.`);

  const years = Array.from({ length: N }, (_, i) => i + 1);
  const resaleNow = bookValue(v.purchase_cost, v.age_months, a);
  const keepEnergy = energyPerKm(v, a, stats), keepMaint = v.wear_cost / v.km;
  const keep = option(resaleNow - bookValue(v.purchase_cost, v.age_months + 12 * N, a),
    years.map((t) => kmPerYear * (keepEnergy + keepMaint * (1 + g) ** t)), kmPerYear);
  const fresh = (price: number, energy: number, maint: number) =>
    option(price - bookValue(price, 12 * N, a), years.map((t) => kmPerYear * (energy + maint * (1 + g) ** (t - 1))), kmPerYear);
  const ice = fresh(a.icePrice, (a.iceLPer100 / 100) * a.fuelPrice, a.iceMaintKm);
  const ev = fresh(a.evPrice, (a.evKwhPer100 / 100) * a.elecPrice, a.evMaintKm);
  const best = ev.total <= ice.total ? "ev" : "ice", chosen = best === "ev" ? ev : ice;
  const saving = keep.total - chosen.total, savingPct = keep.total > 0 ? (100 * saving) / keep.total : null;
  const netCapital = (best === "ev" ? a.evPrice : a.icePrice) - resaleNow;
  const paid = years.find((t) => keep.cumulativeRunning[t - 1] - chosen.cumulativeRunning[t - 1] >= netCapital);
  const breakEvenYear = paid ?? null;
  const label = best === "ev" ? "an EV" : "a petrol vehicle";
  const payback = breakEvenYear ? `pays back in year ${breakEvenYear}` : `does not pay back within ${N} years`;
  let decision: Decision, reason: string;
  if (savingPct !== null && savingPct >= a.minSavingPct) {
    decision = best;
    reason = `Replacing with ${label} saves ${money(saving)} (${Math.round(savingPct)} %) over ${N} years; ${payback}.`;
  } else if (saving <= 0) {
    decision = "keep";
    reason = `Keeping costs ${money(-saving)} less over ${N} years than replacing with ${label}.`;
  } else {
    decision = "keep";
    reason = `Replacing with ${label} saves only ${Math.round(savingPct ?? 0)} %, under your ${a.minSavingPct} % threshold.`;
  }
  return { ...base, resaleNow, keep, ice, ev, best, saving, savingPct, netCapital, breakEvenYear, decision, reason };
}

export interface FleetSummary {
  vehicles: number;
  counts: Record<Decision, number>;
  purchase: number;       // price of every recommended replacement
  resale: number;         // value today of the vehicles they replace
  capital: number;        // purchase minus resale
  saving: number;         // over the horizon, recommended replacements only
}
export function summarise(plans: VehiclePlan[], a: Assumptions): FleetSummary {
  const counts: Record<Decision, number> = { keep: 0, ev: 0, ice: 0, review: 0 };
  let purchase = 0, resale = 0, saving = 0;
  for (const p of plans) {
    counts[p.decision]++;
    if (p.decision === "ev" || p.decision === "ice") {
      purchase += p.decision === "ev" ? a.evPrice : a.icePrice;
      resale += p.resaleNow ?? 0;
      saving += p.saving ?? 0;
    }
  }
  return { vehicles: plans.length, counts, purchase, resale, capital: purchase - resale, saving };
}
