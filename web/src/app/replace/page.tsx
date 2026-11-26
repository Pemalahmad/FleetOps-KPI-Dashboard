"use client";

import { useMemo, useState } from "react";
import { Circle, Square, Triangle } from "@phosphor-icons/react";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { EmptyState, Skeleton } from "@/components/ui";
import { downloadText, safeCell } from "@/lib/exporters";
import {
  DECISION_WORD, defaultAssumptions, planVehicle, summarise,
  type AssumptionKey, type Assumptions, type Decision, type PowertrainStats, type SourceKind, type VehicleHistory, type VehiclePlan,
} from "@/lib/replace-plan";

/** Fleet-paid work that wears in with age: everything except collision repairs, which are one-off events. */
const WEAR = `SELECT vehicle_id, date_trunc('month', opened_at)::DATE AS month_start,
    sum(total_cost) FILTER (WHERE paid_by = 'Fleet' AND job_type <> 'Collision') AS wear FROM stg_work_orders GROUP BY ALL`;

const HISTORY = (w: string | null) => `
  WITH w AS (${WEAR}),
  h AS (
    SELECT vm.vehicle_id, sum(vm.km) AS km, sum(vm.days_in_service) AS days, count(*) AS months,
           sum(coalesce(vm.book_value_start - vm.book_value_end, 0)) AS depreciation,
           sum(e.energy_cost) AS energy_cost, sum(e.fuel_l) AS fuel_l, sum(e.kwh) AS kwh,
           sum(coalesce(m.maintenance_cost, 0)) AS maintenance_cost, sum(coalesce(w.wear, 0)) AS wear_cost
    FROM int_vehicle_months vm
    LEFT JOIN int_energy_vehicle_month e USING (vehicle_id, month_start)
    LEFT JOIN int_maintenance_vehicle_month m USING (vehicle_id, month_start)
    LEFT JOIN w USING (vehicle_id, month_start)
    GROUP BY 1)
  SELECT v.vehicle_id, v.make, v.model, v.powertrain, v.region, v.age_months, v.purchase_cost,
         h.km, h.days, h.months, h.depreciation, h.energy_cost, h.fuel_l, h.kwh, h.maintenance_cost, h.wear_cost
  FROM stg_vehicles v JOIN h USING (vehicle_id)
  WHERE v.is_active${regionWhere(w, "AND", "v.region")}`;

const STATS = (w: string | null) => `
  WITH w AS (${WEAR}),
  vm AS (
    SELECT vm.*, date_diff('month', vm.in_service_date, vm.month_start) AS age_m, e.fuel_l, e.kwh, coalesce(w.wear, 0) AS maint
    FROM int_vehicle_months vm
    LEFT JOIN int_energy_vehicle_month e USING (vehicle_id, month_start)
    LEFT JOIN w USING (vehicle_id, month_start)${regionWhere(w, "WHERE", "vm.region")}),
  p AS (SELECT powertrain, avg(purchase_cost) AS avg_price, count(purchase_cost) AS priced FROM stg_vehicles WHERE is_active${regionWhere(w, "AND")} GROUP BY 1)
  SELECT vm.powertrain,
         100 * sum(fuel_l) / nullif(sum(km) FILTER (WHERE fuel_l IS NOT NULL), 0) AS l_per_100km,
         100 * sum(kwh) / nullif(sum(km) FILTER (WHERE kwh IS NOT NULL), 0) AS kwh_per_100km,
         coalesce(sum(maint) FILTER (WHERE age_m < 12), 0) AS maint_y1, coalesce(sum(km) FILTER (WHERE age_m < 12), 0) AS km_y1,
         count(*) FILTER (WHERE age_m < 12) AS months_y1,
         coalesce(sum(maint) FILTER (WHERE age_m BETWEEN 12 AND 23), 0) AS maint_y2, coalesce(sum(km) FILTER (WHERE age_m BETWEEN 12 AND 23), 0) AS km_y2,
         count(*) FILTER (WHERE age_m BETWEEN 12 AND 23) AS months_y2,
         any_value(p.avg_price) AS avg_price, coalesce(any_value(p.priced), 0) AS priced
  FROM vm LEFT JOIN p USING (powertrain) GROUP BY 1`;

const SETTINGS = (w: string | null) => `
  SELECT (SELECT value FROM cfg_settings WHERE key = 'currency') AS currency,
         (SELECT value FROM cfg_settings WHERE key = 'useful_life_years')::DOUBLE AS useful_life_years,
         (SELECT value FROM cfg_settings WHERE key = 'residual_value_pct')::DOUBLE AS residual_value_pct,
         (SELECT value FROM cfg_settings WHERE key = 'depreciation_method') AS depreciation_method,
         fuel_price(${w ? `'${w.replace(/'/g, "''")}'` : "'*'"}) AS fuel_price,
         elec_price(${w ? `'${w.replace(/'/g, "''")}'` : "'*'"}) AS elec_price`;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The assumption table, in reading order. `step` and the bounds also validate what the owner types. */
const FIELDS: { key: AssumptionKey; label: string; unit: string; min: number; max: number; step: number; money?: boolean }[] = [
  { key: "horizonYears", label: "Planning horizon", unit: "years", min: 1, max: 15, step: 1 },
  { key: "evPrice", label: "New electric vehicle price", unit: "", min: 0, max: 1e7, step: 100, money: true },
  { key: "icePrice", label: "New petrol vehicle price", unit: "", min: 0, max: 1e7, step: 100, money: true },
  { key: "elecPrice", label: "Electricity price", unit: "per kWh", min: 0, max: 100, step: 0.01, money: true },
  { key: "fuelPrice", label: "Fuel price", unit: "per litre", min: 0, max: 100, step: 0.01, money: true },
  { key: "evKwhPer100", label: "New electric vehicle use", unit: "kWh / 100 km", min: 0, max: 200, step: 0.1 },
  { key: "iceLPer100", label: "New petrol vehicle use", unit: "L / 100 km", min: 0, max: 100, step: 0.1 },
  { key: "evMaintKm", label: "New electric vehicle maintenance", unit: "per km, year 1", min: 0, max: 10, step: 0.001, money: true },
  { key: "iceMaintKm", label: "New petrol vehicle maintenance", unit: "per km, year 1", min: 0, max: 10, step: 0.001, money: true },
  { key: "maintGrowthPct", label: "Maintenance rise with age", unit: "% a year", min: 0, max: 100, step: 0.1 },
  { key: "usefulLifeYears", label: "Useful life", unit: "years", min: 1, max: 40, step: 1 },
  { key: "residualPct", label: "Value left at end of life", unit: "%", min: 0, max: 100, step: 1 },
  { key: "minSavingPct", label: "Replace only if it saves at least", unit: "%", min: 0, max: 100, step: 1 },
  { key: "minMonths", label: "History needed to judge a vehicle", unit: "months", min: 0, max: 60, step: 1 },
];
const KIND_WORD: Record<SourceKind, string> = { data: "Your data", settings: "Your settings", assumption: "Assumption", placeholder: "Placeholder" };
const ORDER: Decision[] = ["ev", "ice", "keep", "review"];
const PAGE = 25;

/** A typed assumption, if it is a number inside the field's bounds; otherwise null and the default stays. */
function valid(key: AssumptionKey, text: string | undefined) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f || text === undefined || text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= f.min && n <= f.max ? n : null;
}

export default function ReplacePage() {
  const engine = useEngine();
  const region = engine.region;
  const rows = useSql<VehicleHistory>(HISTORY(region));
  const stats = useSql<PowertrainStats>(STATS(region));
  const settings = useSql<{ currency: string | null; useful_life_years: number | null; residual_value_pct: number | null; depreciation_method: string | null; fuel_price: number | null; elec_price: number | null }>(SETTINGS(region));
  const s = settings.data?.[0];
  const base = useMemo(() => stats.data && s ? defaultAssumptions({
    stats: stats.data.map((r) => ({ ...r, l_per_100km: num(r.l_per_100km), kwh_per_100km: num(r.kwh_per_100km), maint_y1: Number(r.maint_y1), km_y1: Number(r.km_y1),
      months_y1: Number(r.months_y1), maint_y2: Number(r.maint_y2), km_y2: Number(r.km_y2), months_y2: Number(r.months_y2), avg_price: num(r.avg_price), priced: Number(r.priced) })),
    fuelPrice: num(s.fuel_price), elecPrice: num(s.elec_price), usefulLifeYears: num(s.useful_life_years), residualPct: num(s.residual_value_pct), method: s.depreciation_method,
  }) : null, [stats.data, s]);
  // What the owner typed, per assumption; anything not typed (or not a valid number) uses the default.
  const [draft, setDraft] = useState<Partial<Record<AssumptionKey, string>>>({});
  const [filter, setFilter] = useState<Decision | "all">("all"), [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE), [open, setOpen] = useState<string | null>(null);

  const a = useMemo<Assumptions | null>(() => base ? Object.fromEntries(Object.entries(base.values).map(([k, v]) => {
    const key = k as AssumptionKey;
    if (key === "method") return [k, draft.method === "straight_line" || draft.method === "declining_balance" ? draft.method : v];
    return [k, valid(key, draft[key]) ?? v];
  })) as unknown as Assumptions : null, [base, draft]);

  const currency = /^[A-Z]{3}$/.test(s?.currency ?? "") ? s!.currency! : "USD";
  const money = useMemo(() => {
    const whole = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
    return (n: number) => whole.format(Math.round(n));
  }, [currency]);
  const perKm = useMemo(() => {
    const f = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return (n: number | null) => (n === null || !Number.isFinite(n) ? "–" : f.format(n));
  }, [currency]);
  const count = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);

  const plans = useMemo(() => !a || !rows.data ? null : rows.data.map((r) => planVehicle({
    ...r, age_months: Number(r.age_months), purchase_cost: num(r.purchase_cost), km: Number(r.km), days: Number(r.days), months: Number(r.months),
    depreciation: Number(r.depreciation), energy_cost: num(r.energy_cost), fuel_l: num(r.fuel_l), kwh: num(r.kwh), maintenance_cost: Number(r.maintenance_cost), wear_cost: Number(r.wear_cost),
  }, a, money, stats.data ?? [])), [a, rows.data, money, stats.data]);
  const summary = plans && a ? summarise(plans, a) : null;
  const sorted = useMemo(() => plans ? [...plans].sort((x, y) => ORDER.indexOf(x.decision) - ORDER.indexOf(y.decision) || (y.saving ?? -Infinity) - (x.saving ?? -Infinity)) : [], [plans]);
  const visible = sorted.filter((p) => (filter === "all" || p.decision === filter) && (p.id + " " + p.name + " " + (p.region ?? "")).toLowerCase().includes(search.toLowerCase()));
  const chosen = open ? plans?.find((p) => p.id === open) ?? null : null;

  const snapshot = engine.log?.snapshot.slice(0, 10) ?? "";
  const who = engine.dataset === "demo" ? "Demo fleet" : engine.workspace?.name ?? "My fleet";
  const failed = rows.error || stats.error || settings.error;
  const N = a ? Math.round(a.horizonYears) : 5;
  const replaced = summary ? summary.counts.ev + summary.counts.ice : 0;

  const download = () => {
    if (!plans || !a || !base) return;
    const cell = (v: unknown) => { const c = safeCell(v); return c === null ? "" : `"${String(c).replace(/"/g, '""')}"`; };
    const line = (cells: unknown[]) => cells.map(cell).join(",");
    const r = (n: number | null, d = 3) => (n === null || !Number.isFinite(n) ? null : Number(n.toFixed(d)));
    const text = [
      line(["Vehicle", "Make and model", "Powertrain", "Region", "Age (months)", "km a year", `Cost per km to date (${currency})`, `Keep, per km (${currency})`,
        `New petrol, per km (${currency})`, `New EV, per km (${currency})`, `Saving over ${N} years (${currency})`, "Break-even year", "Recommendation", "Reason"]),
      ...sorted.map((p) => line([p.id, p.name, p.powertrain, p.region, p.ageMonths, r(p.kmPerYear, 0), r(p.costPerKmToDate), r(p.keep?.perKm ?? null), r(p.ice?.perKm ?? null),
        r(p.ev?.perKm ?? null), r(p.saving, 0), p.breakEvenYear, DECISION_WORD[p.decision], p.reason])),
      "", line(["Assumption", "Value", "Source"]),
      ...FIELDS.map((f) => line([f.label + (f.unit ? ` (${f.unit})` : ""), a[f.key], draft[f.key] !== undefined && valid(f.key, draft[f.key]) !== null ? "Entered by you" : KIND_WORD[base.sources[f.key].kind] + ": " + base.sources[f.key].note])),
      line(["Depreciation method", a.method, KIND_WORD[base.sources.method.kind]]),
    ].join("\r\n");
    downloadText(`replace-or-keep-${snapshot || "plan"}.csv`, text);
  };

  return <div className="sop-page rp-page">
    <header className="sop-head">
      <h1>Replace or keep</h1>
      <p>{summary ? <><strong>{count.format(replaced)} of {count.format(summary.vehicles)} vehicles cost less to replace over {N} years.</strong> </> : "Working out each vehicle’s cost. "}
        {who}, {(region ?? "all regions").toLowerCase() === "all regions" ? "all regions" : region}{snapshot ? <>, data to <time dateTime={snapshot}>{snapshot}</time></> : null}.
        {" "}A planning estimate from your records and the assumptions on this page; confirm prices with a dealer before you buy. <a href="#rp-method">How this is calculated</a></p>
    </header>
    {failed && <p role="alert" className="mb-4 text-sm text-bad">The vehicle history could not be loaded. Check Pipeline &amp; your data. {failed}</p>}

    {!plans || !summary || !a || !base ? <Skeleton height={520} /> : plans.length === 0 ? <EmptyState title="No active vehicles with history yet">
      Import a vehicle register with purchase costs, usage and work orders, then this page prices keeping and replacing each vehicle.</EmptyState> : <>
      <section aria-labelledby="rp-fleet">
        <h2 id="rp-fleet" className="rp-h2">Fleet over {N} years</h2>
        <dl className="rp-figures">
          <div><dt>Replace with EV</dt><dd>{count.format(summary.counts.ev)}</dd></div>
          <div><dt>Replace with ICE</dt><dd>{count.format(summary.counts.ice)}</dd></div>
          <div><dt>Keep</dt><dd>{count.format(summary.counts.keep)}</dd></div>
          <div><dt>Review</dt><dd>{count.format(summary.counts.review)}</dd></div>
          <div><dt>Capital needed</dt><dd>{money(summary.capital)}</dd><p>{money(summary.purchase)} to buy, less {money(summary.resale)} from selling the vehicles replaced</p></div>
          <div><dt>Saving over {N} years</dt><dd>{money(summary.saving)}</dd><p>From the recommended replacements, against keeping them</p></div>
        </dl>
      </section>

      <section aria-labelledby="rp-vehicles" className="rp-section">
        <h2 id="rp-vehicles" className="rp-h2">Vehicles <button type="button" className="sop-primary" onClick={download}>Download plan</button></h2>
        <div className="rp-controls">
          <label className="sr-only" htmlFor="rp-search">Find a vehicle</label>
          <input id="rp-search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Search vehicle, model or region" className="sop-search" />
          <div className="sop-tabs" role="group" aria-label="Filter by recommendation">{(["all", ...ORDER] as const).map((id) =>
            <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setShown(PAGE); }}>
              {id === "all" ? "All" : DECISION_WORD[id]} <span className="tnum text-faint">{count.format(id === "all" ? summary.vehicles : summary.counts[id])}</span></button>)}</div>
        </div>
        <div className="rp-scroll"><table className="rp-table rp-vehicles">
          <thead><tr>
            <th scope="col">Vehicle</th><th scope="col" className="rp-n">Age</th><th scope="col" className="rp-n">km a year</th>
            <th scope="col" className="rp-n">Per km to date</th><th scope="col" className="rp-n">Keep {N} yrs</th><th scope="col" className="rp-n">New ICE</th>
            <th scope="col" className="rp-n">New EV</th><th scope="col" className="rp-n">Break-even</th><th scope="col">Recommendation</th>
          </tr></thead>
          <tbody>{visible.slice(0, shown).map((p) => <Row key={p.id} p={p} perKm={perKm} count={count} open={open === p.id} onOpen={() => { setOpen(open === p.id ? null : p.id); if (open !== p.id) showDetail(); }} />)}
            {!visible.length && <tr><td colSpan={9} className="py-8 text-center text-muted">No vehicles match. Clear the search or choose All.</td></tr>}</tbody>
        </table></div>
        <p className="rp-more">{visible.length > shown ? <button type="button" className="rp-link" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more</button> : null}
          <span>Showing {count.format(Math.min(shown, visible.length))} of {count.format(visible.length)}. Per-km figures include value lost, energy and maintenance.</span></p>
        {chosen && <Detail p={chosen} a={a} money={money} perKm={perKm} count={count} />}
      </section>

      <section aria-labelledby="rp-assume" className="rp-section">
        <h2 id="rp-assume" className="rp-h2">Assumptions <button type="button" className="rp-link" onClick={() => setDraft({})} disabled={!Object.keys(draft).length}>Reset to defaults</button></h2>
        <p className="rp-note">Numbers marked <b>Placeholder</b> have no source in your fleet: enter your own. Changes stay in this tab until it reloads; download the plan to keep them.</p>
        <div className="rp-scroll"><table className="rp-table rp-assume">
          <thead><tr><th scope="col">Input</th><th scope="col">Value</th><th scope="col">Source</th></tr></thead>
          <tbody>{FIELDS.map((f) => {
            const src = base.sources[f.key], typed = draft[f.key], bad = typed !== undefined && typed.trim() !== "" && valid(f.key, typed) === null;
            const mine = typed !== undefined && valid(f.key, typed) !== null;
            return <tr key={f.key}>
              <th scope="row"><label htmlFor={"rp-" + f.key}>{f.label}</label></th>
              <td><span className="rp-input"><input id={"rp-" + f.key} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step}
                value={typed ?? String(base.values[f.key])} aria-invalid={bad || undefined} aria-describedby={"rp-src-" + f.key}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                <span>{f.money ? currency + (f.unit ? " " + f.unit : "") : f.unit}</span></span>
                {bad && <small className="text-bad">Enter {f.min} to {count.format(f.max)}</small>}</td>
              <td id={"rp-src-" + f.key}><span className="rp-kind" data-kind={mine ? "mine" : src.kind}>{mine ? "Entered by you" : KIND_WORD[src.kind]}</span> <span className="rp-src">{src.note}</span></td>
            </tr>;
          })}
          <tr><th scope="row"><label htmlFor="rp-method-select">Depreciation</label></th>
            <td><select id="rp-method-select" className="rp-select" value={draft.method ?? a.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
              <option value="straight_line">Straight line</option><option value="declining_balance">Declining balance</option></select></td>
            <td><span className="rp-kind" data-kind={draft.method ? "mine" : base.sources.method.kind}>{draft.method ? "Entered by you" : KIND_WORD[base.sources.method.kind]}</span> <span className="rp-src">{base.sources.method.note} Resale value today is taken to be the book value on this curve.</span></td></tr>
          </tbody>
        </table></div>
      </section>

      <Method N={N} />
    </>}
  </div>;
}

/** The vehicle sheet opens below the list: bring it into view. */
function showDetail() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("rp-detail")?.scrollIntoView({ block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })));
}

const SHAPE = { ev: Square, ice: Square, keep: Circle, review: Triangle } as const;
/** A shape and a word, so the recommendation never rests on colour. */
function Verdict({ d }: { d: Decision }) {
  const Icon = SHAPE[d];
  return <span className="sop-state rp-verdict" data-decision={d}><Icon size={9} weight={d === "keep" ? "regular" : "fill"} aria-hidden />{DECISION_WORD[d]}</span>;
}

function Row({ p, perKm, count, open, onOpen }: { p: VehiclePlan; perKm: (n: number | null) => string; count: Intl.NumberFormat; open: boolean; onOpen: () => void }) {
  return <tr data-open={open || undefined}>
    <th scope="row"><button type="button" className="rp-vehicle" aria-expanded={open} aria-controls="rp-detail" onClick={onOpen}>
      <span className="font-mono">{p.id}</span><small>{[p.name, p.powertrain, p.region].filter(Boolean).join(" · ")}</small></button></th>
    <td className="rp-n">{count.format(p.ageMonths)} mo</td>
    <td className="rp-n">{p.kmPerYear === null ? "–" : count.format(Math.round(p.kmPerYear / 100) * 100)}</td>
    <td className="rp-n">{perKm(p.costPerKmToDate)}</td>
    <td className="rp-n">{perKm(p.keep?.perKm ?? null)}</td>
    <td className="rp-n" data-best={p.best === "ice" || undefined}>{perKm(p.ice?.perKm ?? null)}</td>
    <td className="rp-n" data-best={p.best === "ev" || undefined}>{perKm(p.ev?.perKm ?? null)}</td>
    <td className="rp-n">{p.keep ? p.breakEvenYear ? `Year ${p.breakEvenYear}` : "Not within horizon" : "–"}</td>
    <td className="rp-why"><Verdict d={p.decision} /><small>{p.reason}</small></td>
  </tr>;
}

function Detail({ p, a, money, perKm, count }: { p: VehiclePlan; a: Assumptions; money: (n: number) => string; perKm: (n: number | null) => string; count: Intl.NumberFormat }) {
  const N = Math.round(a.horizonYears);
  const best = p.best === "ev" ? p.ev : p.ice;
  return <article id="rp-detail" className="rp-detail" aria-live="polite">
    <header><p className="sop-no">{p.id}</p><h3>{p.name || p.powertrain}, {count.format(p.ageMonths)} months old</h3>
      <p className="sop-signal"><Verdict d={p.decision} /> <span>{p.reason}</span></p></header>
    {p.keep && best && p.ice && p.ev ? <>
      <dl className="sop-facts">
        <div><dt>Value today</dt><dd className="tnum">{money(p.resaleNow ?? 0)} <span className="text-muted">book value, taken as its resale price</span></dd></div>
        <div><dt>Distance</dt><dd className="tnum">{count.format(Math.round(p.kmPerYear ?? 0))} km a year, from its usage records</dd></div>
        <div><dt>Net capital</dt><dd className="tnum">{money(p.netCapital ?? 0)} <span className="text-muted">new {p.best === "ev" ? "EV" : "petrol vehicle"} price less value today</span></dd></div>
      </dl>
      <div className="rp-scroll"><table className="rp-table rp-years">
        <caption className="sr-only">Cost over {N} years: keep against replace</caption>
        <thead><tr><th scope="col">Over {N} years</th><th scope="col" className="rp-n">Keep</th><th scope="col" className="rp-n">New ICE</th><th scope="col" className="rp-n">New EV</th></tr></thead>
        <tbody>
          <tr><th scope="row">Value lost</th><td className="rp-n">{money(p.keep.capital)}</td><td className="rp-n">{money(p.ice.capital)}</td><td className="rp-n">{money(p.ev.capital)}</td></tr>
          <tr><th scope="row">Energy and maintenance</th><td className="rp-n">{money(p.keep.running)}</td><td className="rp-n">{money(p.ice.running)}</td><td className="rp-n">{money(p.ev.running)}</td></tr>
          <tr className="rp-total"><th scope="row">Total</th><td className="rp-n">{money(p.keep.total)}</td><td className="rp-n">{money(p.ice.total)}</td><td className="rp-n">{money(p.ev.total)}</td></tr>
          <tr><th scope="row">Per km</th><td className="rp-n">{perKm(p.keep.perKm)}</td><td className="rp-n">{perKm(p.ice.perKm)}</td><td className="rp-n">{perKm(p.ev.perKm)}</td></tr>
        </tbody>
      </table></div>
      <div className="rp-scroll"><table className="rp-table rp-years">
        <caption className="rp-caption">Payback: energy and maintenance saved by the {p.best === "ev" ? "EV" : "petrol vehicle"}, against the {money(p.netCapital ?? 0)} net capital</caption>
        <thead><tr><th scope="col">Year</th><th scope="col" className="rp-n">Keep, running to date</th><th scope="col" className="rp-n">Replace, running to date</th><th scope="col" className="rp-n">Saved to date</th><th scope="col" className="rp-n">Still to recover</th></tr></thead>
        <tbody>{p.keep.cumulativeRunning.map((k, i) => {
          const saved = k - best.cumulativeRunning[i], left = (p.netCapital ?? 0) - saved;
          return <tr key={i} data-even={p.breakEvenYear === i + 1 || undefined}><th scope="row">{i + 1}{p.breakEvenYear === i + 1 ? " (break-even)" : ""}</th>
            <td className="rp-n">{money(k)}</td><td className="rp-n">{money(best.cumulativeRunning[i])}</td><td className="rp-n">{money(saved)}</td><td className="rp-n">{left > 0 ? money(left) : "Paid back"}</td></tr>;
        })}</tbody>
      </table></div>
    </> : <p className="mt-3 text-muted">Add the missing record and this vehicle is priced like the others.</p>}
  </article>;
}

function Method({ N }: { N: number }) {
  return <section id="rp-method" aria-labelledby="rp-method-h" className="rp-section rp-method">
    <h2 id="rp-method-h" className="rp-h2">How this is calculated</h2>
    <p className="rp-note">Every vehicle is priced three ways over the same horizon (N = {N} years) and the same distance. Costs are not discounted, and taxes, insurance, financing, fines and downtime are left out because they are similar for each option or not in the records.</p>
    <ol className="rp-formulas">
      <li><b>Distance a year</b><code>km a year = observed km ÷ observed days in service × 365.25</code></li>
      <li><b>Cost per km to date</b><code>(energy paid + fleet-paid maintenance + value lost) ÷ observed km</code><span>Observed months only; value lost follows the depreciation in your fleet settings. Work paid by the maker or an insurer is left out.</span></li>
      <li><b>Book value</b><code>straight line: price − price × (1 − residual %) × min(age ÷ useful life, 1)</code><code>declining balance: price × residual % ^ min(age ÷ useful life, 1)</code><span>The same curve as the warehouse. Resale value today is the book value at the vehicle’s age.</span></li>
      <li><b>Energy per km, kept vehicle</b><code>(litres used × fuel price + kWh used × electricity price) ÷ observed km</code><span>What it actually used, at the prices in the assumptions, so every option is priced at the same rates. A vehicle with no energy records uses its powertrain’s fleet average.</span></li>
      <li><b>Energy per km, new vehicle</b><code>petrol: L per 100 km ÷ 100 × fuel price · electric: kWh per 100 km ÷ 100 × electricity price</code></li>
      <li><b>Maintenance in year t</b><code>kept: observed maintenance per km × (1 + rise)^t · new: year-1 maintenance per km × (1 + rise)^(t − 1)</code><span>Fleet-paid work without collision repairs, which are one-off events rather than wear. Year-1 maintenance and the rise come from the same work in your fleet.</span></li>
      <li><b>Running cost</b><code>Σ for t = 1…N of km a year × (energy per km + maintenance per km in year t)</code></li>
      <li><b>Value lost</b><code>kept: value today − book value at (age + N years) · new: price − book value at N years</code></li>
      <li><b>Total cost of ownership</b><code>value lost + running cost</code><code>per km = total ÷ (km a year × N)</code></li>
      <li><b>Saving</b><code>saving = keep total − cheaper of (new ICE total, new EV total)</code></li>
      <li><b>Break-even year</b><code>first year t where Σ running saved to year t ≥ new price − value today</code><span>When the energy and maintenance saved have paid back the cash put in. “Not within horizon” if that never happens in N years.</span></li>
      <li><b>Recommendation</b><code>Review: no purchase cost, no distance, or less history than the minimum</code><code>Replace with EV / ICE: saving ≥ threshold % of keep total, with the cheaper replacement</code><code>Keep: otherwise</code></li>
      <li><b>Fleet figures</b><code>capital needed = Σ (new price − value today) over vehicles to replace</code><code>saving over N years = Σ saving over vehicles to replace</code></li>
    </ol>
    <p className="rp-note">Limits: replacement prices and use are one figure per powertrain, so set them for the class you are reviewing (a van is not a sedan). Maintenance rise is measured across vehicles of different ages, not by following the same vehicle. Electric range, charging access and duty cycle are not checked: a vehicle the planner marks for an EV still needs an operations review.</p>
  </section>;
}
