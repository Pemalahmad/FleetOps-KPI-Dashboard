/**
 * The metric network: every KPI as a node, connected by
 *   - identities: exact algebra that holds to the decimal (asserted by SQL test t21), and
 *   - statistical links: multiple regressions fitted on the region × month panel (mart_metric_panel),
 *     backed by job-level evidence (mart_job_outcomes).
 * Pure functions only, so the maths is unit-tested (metrics.test.ts).
 */
import { multiOls, type MultiOls } from "./stats";

export type Group = "north" | "fleet" | "clock" | "workshop" | "customer" | "ledger" | "licence";

export interface MetricNode {
  id: string;
  label: string;
  group: Group;
  unit: string;
  decimals: number;
  better: "lower" | "higher";
  target?: string;          // cfg_targets.kpi
  symbol: string;           // KaTeX symbol used in formulas
  definition: string;       // KaTeX
  meaning: string;
}

export const GROUPS: Record<Group, { label: string; color: string }> = {
  north: { label: "North star", color: "#F43F5E" },
  fleet: { label: "Fleet clock", color: "#F59E0B" },
  clock: { label: "Hours per visit", color: "#06B6D4" },
  workshop: { label: "Workshop clock", color: "#6366F1" },
  customer: { label: "Customer clock", color: "#10B981" },
  ledger: { label: "Ledger", color: "#8B5CF6" },
  licence: { label: "Licence (a gate)", color: "#94A3B8" },
};

export const NODES: MetricNode[] = [
  { id: "offroad", label: "Off-road h / vehicle / month", group: "north", unit: "h", decimals: 2, better: "lower",
    symbol: "N", definition: "N = \\dfrac{30.4375 \\, \\sum_j h_j}{\\sum_v d_v}",
    meaning: "Hours the fleet is off the road for service, per vehicle per month. Every broken law shows up here." },
  { id: "availability", label: "Availability", group: "fleet", unit: "%", decimals: 2, better: "higher", target: "availability_pct",
    symbol: "A", definition: "A = 100\\left(1 - \\dfrac{\\sum_j h_j}{24\\sum_v d_v}\\right)",
    meaning: "Share of vehicle-hours not in service." },
  { id: "visits", label: "Visits / vehicle / month", group: "fleet", unit: "", decimals: 3, better: "lower",
    symbol: "V", definition: "V = \\dfrac{30.4375 \\, J}{\\sum_v d_v}", meaning: "How often a vehicle comes in." },
  { id: "first_visits", label: "First visits / vehicle / month", group: "fleet", unit: "", decimals: 3, better: "lower",
    symbol: "V_1", definition: "V_1 = \\dfrac{30.4375 \\,(J - J_{rep})}{\\sum_v d_v}", meaning: "Visits that are not comebacks." },
  { id: "repeat_share", label: "Comeback share of visits", group: "workshop", unit: "%", decimals: 2, better: "lower",
    symbol: "\\rho", definition: "\\rho = \\dfrac{J_{rep}}{J}", meaning: "Unplanned returns within the repeat window." },
  { id: "per_visit", label: "Off-road h per visit", group: "clock", unit: "h", decimals: 2, better: "lower",
    symbol: "H", definition: "H = \\dfrac{1}{J}\\sum_j h_j", meaning: "The fleet clock of an average visit." },
  { id: "workshop", label: "Workshop h per visit", group: "clock", unit: "h", decimals: 2, better: "lower",
    symbol: "W", definition: "W = \\overline{t_{ready} - t_{key\\,in}}", meaning: "Key in → vehicle ready." },
  { id: "pickup", label: "Pick-up h per visit", group: "clock", unit: "h", decimals: 2, better: "lower",
    symbol: "P", definition: "P = \\overline{t_{key\\,back} - t_{ready}}", meaning: "Ready → customer collects." },
  { id: "back", label: "Back-to-ops h per visit", group: "clock", unit: "h", decimals: 2, better: "lower",
    symbol: "B", definition: "B = \\overline{t_{earning} - t_{key\\,back}}", meaning: "Key back → earning again." },
  { id: "open", label: "Still-open h per visit", group: "clock", unit: "h", decimals: 2, better: "lower",
    symbol: "O", definition: "O = \\overline{t_{snapshot} - t_{key\\,in}}\\;\\text{(open jobs)}", meaning: "Hours on jobs not yet closed." },
  { id: "productivity", label: "Technician productivity", group: "workshop", unit: "%", decimals: 1, better: "higher", target: "productivity_pct",
    symbol: "\\pi", definition: "\\pi = 100\\,\\dfrac{\\text{billed hours}}{\\text{available hours}}", meaning: "Capacity actually converted into work." },
  { id: "parts", label: "Parts on time", group: "workshop", unit: "%", decimals: 1, better: "higher", target: "parts_on_time_pct",
    symbol: "\\phi", definition: "\\phi = 100\\,\\Pr(t_{arrived} \\le t_{ETA})", meaning: "Supplier promises kept (law 4)." },
  { id: "repeat_repair", label: "Repeat repairs", group: "workshop", unit: "%", decimals: 1, better: "lower", target: "repeat_repair_pct",
    symbol: "r", definition: "r = 100\\,\\Pr(\\text{same fault again} \\le 14\\,d)", meaning: "Fix it once (law 3)." },
  { id: "customer_clock", label: "Customer clock h per visit", group: "customer", unit: "h", decimals: 2, better: "lower",
    symbol: "Q", definition: "Q = W + P", meaning: "Key in → key back: the hours the customer counts, per visit (law 1)." },
  { id: "key_to_key", label: "Key-to-key (median)", group: "customer", unit: "h", decimals: 1, better: "lower", target: "key_to_key_p50_h",
    symbol: "K", definition: "K = \\operatorname{median}(t_{key\\,back} - t_{key\\,in})", meaning: "The customer's clock (law 1)." },
  { id: "csat", label: "CSAT", group: "customer", unit: "%", decimals: 1, better: "higher", target: "csat_pct",
    symbol: "S", definition: "S = 100\\,\\Pr(\\text{rating} \\ge 4)", meaning: "Satisfied customers." },
  { id: "low_rating", label: "1-2★ share", group: "customer", unit: "%", decimals: 2, better: "lower", target: "low_rating_pct",
    symbol: "L", definition: "L = 100\\,\\Pr(\\text{rating} \\le 2)", meaning: "Detractors; each triggers SOP-08." },
  { id: "spend", label: "Service spend / vehicle / month", group: "ledger", unit: "$", decimals: 0, better: "lower",
    symbol: "C", definition: "C = \\dfrac{30.4375 \\sum_j c_j}{\\sum_v d_v}", meaning: "What the fleet pays to keep each vehicle running." },
  { id: "spend_per_visit", label: "Spend per visit", group: "ledger", unit: "$", decimals: 0, better: "lower",
    symbol: "c", definition: "c = \\dfrac{1}{J}\\sum_j c_j", meaning: "Average bill." },
  { id: "goodwill", label: "Goodwill % of spend", group: "ledger", unit: "%", decimals: 2, better: "lower", target: "goodwill_pct",
    symbol: "G", definition: "G = 100\\,\\dfrac{\\sum_j g_j}{\\sum_j c_j}", meaning: "The price of broken laws." },
  { id: "fines", label: "Fines / 100 vehicles", group: "licence", unit: "", decimals: 1, better: "lower", target: "fines_per_100_vehicles",
    symbol: "F", definition: "F = 100\\,\\dfrac{\\text{fines}}{\\text{active vehicles}}", meaning: "Law 6: the licence is a gate, not a score; it is deliberately not traded against the clocks." },
  { id: "recalls", label: "Recall completion", group: "licence", unit: "%", decimals: 1, better: "higher", target: "recall_completion_pct",
    symbol: "R_c", definition: "R_c = 100\\,\\dfrac{\\text{recalls done}}{\\text{recalls due}}", meaning: "Safety campaigns closed 8+ weeks after launch." },
];
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, MetricNode>;

/** Exact identities. `eval` recomputes the output from its inputs. */
export interface Identity {
  output: string;
  inputs: string[];
  kind: "product" | "sum" | "affine" | "quotient";
  latex: string;
  eval: (v: Record<string, number>) => number;
}

export const HOURS_PER_MONTH = 24 * 30.4375;

export const IDENTITIES: Identity[] = [
  { output: "offroad", inputs: ["visits", "per_visit"], kind: "product", latex: "N = V \\times H",
    eval: (v) => v.visits * v.per_visit },
  { output: "per_visit", inputs: ["workshop", "pickup", "back", "open"], kind: "sum", latex: "H = W + P + B + O",
    eval: (v) => v.workshop + v.pickup + v.back + v.open },
  { output: "customer_clock", inputs: ["workshop", "pickup"], kind: "sum", latex: "Q = W + P",
    eval: (v) => v.workshop + v.pickup },
  { output: "availability", inputs: ["offroad"], kind: "affine", latex: "A = 100\\left(1 - \\dfrac{N}{730.5}\\right)",
    eval: (v) => 100 * (1 - v.offroad / HOURS_PER_MONTH) },
  { output: "visits", inputs: ["first_visits", "repeat_share"], kind: "quotient", latex: "V = \\dfrac{V_1}{1 - \\rho}",
    eval: (v) => v.first_visits / (1 - v.repeat_share / 100) },
  { output: "spend", inputs: ["visits", "spend_per_visit"], kind: "product", latex: "C = V \\times c",
    eval: (v) => v.visits * v.spend_per_visit },
];

/** Statistical links: for each outcome, a multiple regression on its drivers (region × month panel). */
export interface StatModel {
  output: string;
  drivers: string[];
  why: string;
}
export const STAT_MODELS: StatModel[] = [
  { output: "workshop", drivers: ["productivity", "parts"], why: "Idle capacity and late parts stretch the workshop clock." },
  { output: "key_to_key", drivers: ["customer_clock"], why: "The median job tracks the mean customer clock; the median is less than the mean because long jobs skew it." },
  { output: "csat", drivers: ["key_to_key", "repeat_repair"], why: "Customers rate the time they lost and whether it was fixed." },
  { output: "low_rating", drivers: ["key_to_key", "repeat_repair"], why: "Long waits and comebacks create detractors." },
  { output: "goodwill", drivers: ["low_rating", "repeat_repair"], why: "Goodwill is paid to recover bad experiences." },
];

export interface Edge {
  source: string;
  target: string;
  kind: "identity" | "stat";
}
export const EDGES: Edge[] = [
  ...IDENTITIES.flatMap((i) => i.inputs.map((s) => ({ source: s, target: i.output, kind: "identity" as const }))),
  ...STAT_MODELS.flatMap((m) => m.drivers.map((s) => ({ source: s, target: m.output, kind: "stat" as const }))),
];

// ---------------------------------------------------------------- data
/** One row of mart_metric_panel (region × month). */
export interface PanelRow {
  region: string;
  month_start: string;
  active_vehicles: number;
  vehicle_days: number;
  jobs: number;
  offroad_h: number;
  offroad_h_per_vehicle_month: number;
  visits_per_vehicle_month: number;
  first_visits_per_vehicle_month: number;
  repeat_share: number | null;
  offroad_h_per_visit: number | null;
  workshop_h_per_visit: number | null;
  pickup_h_per_visit: number | null;
  back_to_ops_h_per_visit: number | null;
  open_h_per_visit: number | null;
  availability_exact_pct: number;
  spend_per_visit: number | null;
  spend_per_vehicle_month: number;
  goodwill_share_pct: number | null;
  productivity_pct: number | null;
  parts_on_time_pct: number | null;
  repeat_repair_pct: number | null;
  key_to_key_p50_h: number | null;
  csat_pct: number | null;
  low_rating_pct: number | null;
  responses: number | null;
  fines_per_100_vehicles: number | null;
  recall_completion_pct: number | null;
}

/** Node values for one panel row (region × month). */
export function rowValues(r: PanelRow): Record<string, number | null> {
  return {
    offroad: r.offroad_h_per_vehicle_month, availability: r.availability_exact_pct, visits: r.visits_per_vehicle_month,
    first_visits: r.first_visits_per_vehicle_month, repeat_share: r.repeat_share === null ? null : 100 * r.repeat_share,
    per_visit: r.offroad_h_per_visit, workshop: r.workshop_h_per_visit, pickup: r.pickup_h_per_visit,
    back: r.back_to_ops_h_per_visit, open: r.open_h_per_visit, productivity: r.productivity_pct,
    parts: r.parts_on_time_pct, repeat_repair: r.repeat_repair_pct, key_to_key: r.key_to_key_p50_h,
    csat: r.csat_pct, low_rating: r.low_rating_pct, spend: r.spend_per_vehicle_month,
    spend_per_visit: r.spend_per_visit, goodwill: r.goodwill_share_pct, fines: r.fines_per_100_vehicles,
    customer_clock: r.workshop_h_per_visit === null || r.pickup_h_per_visit === null ? null : r.workshop_h_per_visit + r.pickup_h_per_visit,
    recalls: r.recall_completion_pct,
  };
}

const wavg = (rows: PanelRow[], v: (r: PanelRow) => number | null, w: (r: PanelRow) => number | null) => {
  let s = 0, ws = 0;
  for (const r of rows) {
    const x = v(r), wt = w(r);
    if (x !== null && wt !== null && Number.isFinite(x) && wt > 0) {
      s += x * wt;
      ws += wt;
    }
  }
  return ws > 0 ? s / ws : null;
};

/**
 * Aggregate panel rows of one month into network values. Identity nodes are rebuilt from summed
 * totals, so the identities still hold exactly at network level; KPIs without totals (medians,
 * shares) are weighted means of the regions, weighted by jobs, responses or vehicles.
 */
export function aggregate(rows: PanelRow[]): Record<string, number | null> {
  const D = rows.reduce((s, r) => s + r.vehicle_days, 0);
  const J = rows.reduce((s, r) => s + r.jobs, 0);
  const H = rows.reduce((s, r) => s + r.offroad_h, 0);
  const sumJ = (f: (r: PanelRow) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0) * r.jobs, 0);
  const Jrep = sumJ((r) => r.repeat_share);
  const C = sumJ((r) => r.spend_per_visit);
  const G = rows.reduce((s, r) => s + ((r.goodwill_share_pct ?? 0) / 100) * (r.spend_per_visit ?? 0) * r.jobs, 0);
  const k = D > 0 ? 30.4375 / D : null;
  return {
    offroad: k === null ? null : k * H, availability: D > 0 ? 100 * (1 - H / (24 * D)) : null,
    visits: k === null ? null : k * J, first_visits: k === null ? null : k * (J - Jrep),
    repeat_share: J ? (100 * Jrep) / J : null, per_visit: J ? H / J : null,
    workshop: J ? sumJ((r) => r.workshop_h_per_visit) / J : null, pickup: J ? sumJ((r) => r.pickup_h_per_visit) / J : null,
    back: J ? sumJ((r) => r.back_to_ops_h_per_visit) / J : null, open: J ? sumJ((r) => r.open_h_per_visit) / J : null,
    customer_clock: J ? sumJ((r) => (r.workshop_h_per_visit ?? 0) + (r.pickup_h_per_visit ?? 0)) / J : null,
    spend: k === null ? null : k * C, spend_per_visit: J ? C / J : null, goodwill: C ? (100 * G) / C : null,
    productivity: wavg(rows, (r) => r.productivity_pct, (r) => r.vehicle_days),
    parts: wavg(rows, (r) => r.parts_on_time_pct, (r) => r.jobs),
    repeat_repair: wavg(rows, (r) => r.repeat_repair_pct, (r) => r.jobs),
    key_to_key: wavg(rows, (r) => r.key_to_key_p50_h, (r) => r.jobs),
    csat: wavg(rows, (r) => r.csat_pct, (r) => r.responses),
    low_rating: wavg(rows, (r) => r.low_rating_pct, (r) => r.responses),
    fines: wavg(rows, (r) => r.fines_per_100_vehicles, (r) => r.active_vehicles),
    recalls: wavg(rows, (r) => r.recall_completion_pct, (r) => r.active_vehicles),
  };
}

export interface MonthPoint {
  month: string;
  v: Record<string, number | null>;
}
export function series(rows: PanelRow[]): MonthPoint[] {
  const by = new Map<string, PanelRow[]>();
  for (const r of rows) by.set(r.month_start, [...(by.get(r.month_start) ?? []), r]);
  return [...by.keys()].sort().map((m) => ({ month: m, v: aggregate(by.get(m)!) }));
}

// ---------------------------------------------------------------- statistics on the network
export interface FittedModel extends StatModel {
  fit: MultiOls | null;
}
export function fitModels(rows: PanelRow[]): FittedModel[] {
  const vals = rows.map(rowValues);
  return STAT_MODELS.map((m) => ({
    ...m,
    fit: multiOls(m.drivers.map((d) => vals.map((v) => v[d])), vals.map((v) => v[m.output])),
  }));
}

/** Pearson correlation matrix over every pair of nodes on the panel. */
export function correlationMatrix(rows: PanelRow[], ids: string[]) {
  const vals = rows.map(rowValues);
  const m: (number | null)[][] = ids.map(() => ids.map(() => null));
  ids.forEach((a, i) =>
    ids.forEach((b, j) => {
      const xs: number[] = [], ys: number[] = [];
      for (const v of vals) {
        const x = v[a], y = v[b];
        if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length < 4) return;
      const mx = xs.reduce((s, t) => s + t, 0) / xs.length, my = ys.reduce((s, t) => s + t, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0;
      xs.forEach((x, k) => {
        sxy += (x - mx) * (ys[k] - my);
        sxx += (x - mx) ** 2;
        syy += (ys[k] - my) ** 2;
      });
      m[i][j] = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
    }),
  );
  return m;
}

// ---------------------------------------------------------------- what-if propagation
/** Inputs a manager controls in the simulator: changes in their natural units. */
export const LEVERS = [
  { id: "productivity", label: "Technician productivity", unit: "pp", min: -10, max: 10, step: 0.5 },
  { id: "parts", label: "Parts on time", unit: "pp", min: -20, max: 15, step: 1 },
  { id: "pickup", label: "Pick-up hours per visit", unit: "h", min: -3, max: 3, step: 0.1 },
  { id: "back", label: "Back-to-ops hours per visit", unit: "h", min: -3, max: 3, step: 0.1 },
  { id: "repeat_share", label: "Comeback share", unit: "pp", min: -5, max: 5, step: 0.1 },
  { id: "repeat_repair", label: "Repeat repairs", unit: "pp", min: -5, max: 5, step: 0.1 },
] as const;

/** Topological order: every node after its inputs (identity and statistical). */
export const ORDER: string[] = (() => {
  const parents = new Map<string, string[]>();
  for (const e of EDGES) parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
  const out: string[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const p of parents.get(id) ?? []) visit(p);
    out.push(id);
  };
  NODES.forEach((n) => visit(n.id));
  return out;
})();

/** Only effects significant at this level are propagated: acting on noise is worse than not acting. */
export const ALPHA = 0.05;

/**
 * Propagate lever changes through the network. Statistical links add Σ βᵢ·Δxᵢ (partial effects,
 * first-order) for drivers with p < ALPHA; identities are re-evaluated exactly. `first_visits` is held fixed, so a change in the
 * comeback share moves visits through V = V₁ / (1 − ρ).
 */
export function simulate(base: Record<string, number | null>, models: FittedModel[], levers: Record<string, number>) {
  const out: Record<string, number> = {};
  const delta: Record<string, number> = {};
  const constrained: string[] = [];
  const ident = new Map(IDENTITIES.map((i) => [i.output, i]));
  const stat = new Map(models.map((m) => [m.output, m]));
  for (const id of ORDER) {
    const b = base[id];
    if (b === null || b === undefined || !Number.isFinite(b)) continue;
    const lever = levers[id] ?? 0;
    let v = b + (Number.isFinite(lever) ? lever : 0);
    const m = stat.get(id);
    if (m?.fit) v += m.drivers.reduce((s, d, i) => s + (m.fit!.p[i + 1] < ALPHA ? m.fit!.coef[i + 1] : 0) * (delta[d] ?? 0), 0);
    const idn = ident.get(id);
    if (idn) {
      // Missing parents cannot support an exact counterfactual.
      if (!idn.inputs.every((x) => out[x] !== undefined)) continue;
      v = idn.eval(out);
    }
    // Bound inputs and fitted outcomes before downstream identities are evaluated.
    // Never clip an identity: that would make the displayed algebra false.
    if (!idn) {
      const upper = id === "repeat_share" ? 99.9 : NODE[id].unit === "%" ? 100 : Infinity;
      const bounded = Math.max(0, Math.min(upper, v));
      if (bounded !== v) constrained.push(id);
      v = bounded;
    }
    if (!Number.isFinite(v)) continue;
    out[id] = v;
    delta[id] = v - b;
  }
  const feasible = out.availability === undefined || (out.availability >= 0 && out.availability <= 100);
  return { values: out, delta, constrained, feasible };
}

