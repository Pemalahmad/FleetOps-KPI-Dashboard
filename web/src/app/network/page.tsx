"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chart, tokens } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, fmt, PageHeader, pFmt, rag, ragColor, SectionTitle, Skeleton, Tex } from "@/components/ui";
import { usePanel } from "@/components/use-panel";
import {
  correlationMatrix, EDGES, fitModels, GROUPS, IDENTITIES, LEVERS, NODE, NODES, simulate, type FittedModel,
} from "@/lib/metrics";
import { logistic, ols, productDecomposition, riskRatio, strength, welchSummary } from "@/lib/stats";

// ------------------------------------------------------------------ layout: doctrine bands, inputs on the left
// customer & quality on top · workshop and hours-per-visit clocks in the middle · north star and availability
// on the right · ledger below · licence apart (law 6: a gate, not a score).
const GRID: Record<string, [number, number]> = {
  repeat_repair: [0, -1.7], productivity: [0, 0], parts: [0, 1],
  workshop: [1, 0.5], pickup: [1, 1.6], back: [1, 2.6], open: [1, 3.6],
  customer_clock: [2, -0.5], per_visit: [2, 2.1],
  key_to_key: [3, -0.5], offroad: [3, 3],
  csat: [4, -1.7], low_rating: [4, -0.5], availability: [4, 3], goodwill: [5, -1.1],
  repeat_share: [1, 4.8], first_visits: [1, 5.9], visits: [2, 4.6],
  spend_per_visit: [2, 6.3], spend: [3, 5.5],
  fines: [0, 7.6], recalls: [1, 7.6],
};
const POS: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(GRID).map(([k, [x, y]]) => [k, [x * 240, y * 104]]),
);

const val = (id: string, v: number | null | undefined) => {
  const n = NODE[id];
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${n.unit === "$" ? "$" : ""}${fmt(v, n.decimals)}${n.unit && n.unit !== "$" ? (n.unit === "%" ? "%" : ` ${n.unit}`) : ""}`;
};

export default function NetworkPage() {
  const p = usePanel();
  const { region, dataset, runId } = useEngine();
  const [sel, setSel] = useState("offroad");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState(false);
  const models = useMemo(() => fitModels(p.all), [p.all]);
  const last = p.last?.v ?? {};

  return (
    <>
      <PageHeader art="network" eyebrow="Metric network" title="Every KPI, connected">
        Solid lines are <b className="text-text">identities</b>: exact algebra that holds to the decimal and is asserted by the
        pipeline&apos;s SQL tests. Dashed lines are <b className="text-text">measured drivers</b>: multiple regressions fitted on{" "}
        {p.all.length || "…"} region-months, drawn thicker when the evidence is stronger. Click any metric to see its maths.
      </PageHeader>

      <div className="ops-banner mb-5 grid gap-4 p-5 md:grid-cols-[1fr_auto]">
        <div><p className="text-[14px] font-semibold">{region ?? "All regions"} · {p.last?.month.slice(0, 7) ?? "Waiting for data"}</p>
          <p className="mt-1 text-[12px] text-muted">{NODES.length} metrics · {IDENTITIES.length} exact identities · {models.filter((m) => m.fit).length}/{models.length} fitted models · {p.all.length} region-month observations</p></div>
        <Link className="ops-button self-center" href="/doctrine/#SOP-02">Open operating review</Link>
      </div>
      {p.error && <p role="alert" className="mb-4 text-sm text-bad">Metric evidence could not be loaded: {p.error}. Check the pipeline and rebuild the report.</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-[12px] font-medium">Find a metric<input className="ops-input mt-1" placeholder="Search clocks, costs or quality" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="text-[12px] font-medium">Inspect metric<select className="ops-input mt-1" value={sel} onChange={(e) => setSel(e.target.value)}>
          {NODES.filter((n) => n.id === sel || (n.label + " " + GROUPS[n.group].label).toLowerCase().includes(search.toLowerCase())).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select></label>
        <button className={"ops-chip self-end " + (focus ? "ops-chip-active" : "")} aria-pressed={focus} onClick={() => setFocus(!focus)}>Focus connections</button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="min-w-0 p-3">
          <div className="overflow-x-auto" role="region" aria-label="Interactive metric graph; use Inspect metric for keyboard access" tabIndex={0}>
            <div className="min-w-[680px]">
          {p.ready ? <Graph values={last} models={models} sel={sel} onSelect={setSel} targets={p.targets} focus={focus} /> : <Skeleton height={700} />}
            </div>
          </div>
          <Legend />
        </Card>
        <Detail id={sel} models={models} p={p} onSelect={setSel} />
      </div>

      <SectionTitle sub="Move a lever; statistical links pass on their partial effect (β·Δx), identities are recomputed exactly.">
        What if?
      </SectionTitle>
      {p.ready ? <Simulator key={JSON.stringify([region, dataset, runId])} base={last} models={models} /> : <Skeleton />}

      <SectionTitle sub="Pearson r between every pair of metrics across region-months. Read it with the network: correlation shows co-movement, the network shows the mechanism.">
        Correlation matrix
      </SectionTitle>
      <Card>{p.ready ? <Corr rows={p.all} /> : <Skeleton height={520} />}</Card>

      <SectionTitle sub="The same links tested on individual work orders: logistic regression, risk ratios and Welch t-tests.">
        Job-level evidence
      </SectionTitle>
      <Evidence />
    </>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 pb-1 pt-2 text-[12px] text-muted">
      {Object.entries(GROUPS).map(([k, g]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
          {g.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-accent" /> identity</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-good" /> raising it helps</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-bad" /> raising it hurts</span>
    </div>
  );
}

// ------------------------------------------------------------------ the graph
function Graph({ values, models, sel, onSelect, targets, focus }: {
  values: Record<string, number | null>; models: FittedModel[]; sel: string; onSelect: (id: string) => void;
  focus: boolean;
  targets: Record<string, { green: number; amber: number; direction: string }>;
}) {
  const option = useMemo(() => (dark: boolean) => {
    const t = tokens(dark);
    const connected = new Set([sel, ...EDGES.filter((e) => e.source === sel || e.target === sel).flatMap((e) => [e.source, e.target])]);
    const stat = new Map(models.flatMap((m) => m.drivers.map((d, i) => [`${d}>${m.output}`, { m, i }] as const)));
    return {
      tooltip: { show: false },
      animationDurationUpdate: 300,
      series: [{
        type: "graph" as const, layout: "none" as const, roam: false, left: 70, right: 70, top: 30, bottom: 56, edgeSymbol: ["none", "arrow"], edgeSymbolSize: 7,
        label: { show: true, position: "bottom" as const, distance: 6, color: t.text, fontSize: 11, lineHeight: 15,
          formatter: (x: unknown) => {
            const id = (x as { data: { id: string } }).data.id;
            return `{n|${NODE[id].label}}\n{v|${val(id, values[id])}}`;
          },
          rich: { n: { color: t.muted, fontSize: 10.5 }, v: { color: t.text, fontSize: 12.5, fontWeight: 600 } } },
        data: NODES.map((n) => {
          const r = rag(values[n.id], n.target ? targets[n.target] : undefined);
          const big = n.group === "north";
          return {
            id: n.id, name: n.id, x: POS[n.id][0], y: POS[n.id][1], symbolSize: big ? 46 : n.id === sel ? 30 : 22,
            itemStyle: { opacity: focus && !connected.has(n.id) ? 0.2 : 1, color: GROUPS[n.group].color, borderColor: n.id === sel ? t.text : r ? ragColor(r).replace(/var\((.*)\)/, (_, v) => ({ "--good": t.good, "--warn": t.warn, "--bad": t.bad } as Record<string, string>)[v] ?? t.faint) : t.panel,
              borderWidth: n.id === sel ? 3 : r ? 3 : 1, shadowBlur: 0 },
          };
        }),
        links: EDGES.map((e) => {
          if (e.kind === "identity") return { source: e.source, target: e.target, lineStyle: { color: t.accent, width: 2, opacity: 0.75, curveness: 0.08 } };
          const s = stat.get(`${e.source}>${e.target}`);
          const f = s?.m.fit;
          const beta = f ? f.coef[s!.i + 1] : 0, pv = f ? f.p[s!.i + 1] : 1, tv = f ? Math.abs(f.t[s!.i + 1]) : 0;
          const helps = (beta < 0) === (NODE[e.target].better === "lower");
          return {
            source: e.source, target: e.target,
            lineStyle: { type: "dashed" as const, curveness: 0.12, width: pv < 0.05 ? Math.min(1 + tv / 2.5, 6) : 1,
              opacity: pv < 0.05 ? 0.85 : 0.3, color: pv < 0.05 ? (helps ? t.good : t.bad) : t.faint },
          };
        }),
        emphasis: { focus: "adjacency" as const, lineStyle: { width: 4 } },
      }],
    };
  }, [values, models, sel, targets, focus]);
  return <Chart height={700} option={option} onClick={(e) => e.dataType === "node" && onSelect((e.data as { id: string }).id)} />;
}

// ------------------------------------------------------------------ maths for one metric
function Detail({ id, models, p, onSelect }: { id: string; models: FittedModel[]; p: ReturnType<typeof usePanel>; onSelect: (id: string) => void }) {
  const n = NODE[id];
  const last = p.last?.v ?? {}, prev = p.prev?.v ?? {};
  const idn = IDENTITIES.find((i) => i.output === id);
  const m = models.find((x) => x.output === id);
  const children = EDGES.filter((e) => e.source === id).map((e) => e.target);
  const target = n.target ? p.targets[n.target] : undefined;
  const v = last[id];
  return (
    <Card className="xl:sticky xl:top-36 xl:max-h-[calc(100vh-10rem)] xl:self-start xl:overflow-y-auto">
      <p className="text-[12.5px] text-muted">{GROUPS[n.group].label}</p>
      <h2 className="mt-1 text-[22px] font-semibold">{n.label}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{n.meaning}</p>
      {id === "key_to_key" && <p className="mt-2 text-[12px] text-warn">Across regions this is a job-weighted mean of regional medians, not a pooled fleet median.</p>}
      <div className="mt-4 flex items-baseline gap-3">
        <span className="tile-figure text-[36px]">{val(id, v)}</span>
        {target && (
          <span className="text-[12.5px] text-muted">
            target {target.direction === "higher" ? "≥" : "≤"} {target.green}{" "}
            <span className="ml-1 inline-block h-2 w-2 rounded-full" style={{ background: ragColor(rag(v, target)) }} />
          </span>
        )}
      </div>

      <Block title="Definition"><Tex block>{n.definition}</Tex></Block>

      {idn && (
        <Block title="Identity (exact)">
          <Tex block>{idn.latex}</Tex>
          <Tex block>{substitute(idn.output, last)}</Tex>
          <Decomposition id={id} last={last} prev={prev} />
        </Block>
      )}

      {m && <Regression m={m} />}

      {!idn && !m && n.group !== "licence" && (
        <Block title="Role">An input: it moves the metrics it points to. {children.length ? "" : ""}</Block>
      )}
      {n.group === "licence" && (
        <Block title="Why it is not connected">
          Law 6: the licence is a gate, not a score. Registration, insurance, fines and recalls are never traded against the
          clocks or the ledger, so the network deliberately keeps them apart.
        </Block>
      )}
      {children.length > 0 && (
        <Block title="Feeds">
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button key={c} onClick={() => onSelect(c)} className="ops-chip">{NODE[c].label}</button>
            ))}
          </div>
        </Block>
      )}
      <Block title="Take action">
        <Link className="ops-button" href={"/doctrine/#" + (n.group === "licence" ? id === "recalls" ? "SOP-04" : "SOP-07" : n.group === "customer" ? "SOP-08" : n.group === "ledger" ? "SOP-06" : n.group === "workshop" || n.group === "clock" ? "SOP-03" : "SOP-02")}>Open related procedure</Link>
      </Block>
    </Card>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-2 text-[12.5px] font-semibold text-muted">{title}</p>
      <div className="text-[13.5px] text-muted">{children}</div>
    </div>
  );
}

function substitute(id: string, v: Record<string, number | null>): string {
  const f = (k: string, d = 3) => (v[k] === null || v[k] === undefined ? "?" : (v[k] as number).toFixed(d));
  switch (id) {
    case "offroad": return `${f("offroad", 2)} = ${f("visits")} \\times ${f("per_visit", 2)}`;
    case "per_visit": return `${f("per_visit", 2)} = ${f("workshop", 2)} + ${f("pickup", 2)} + ${f("back", 2)} + ${f("open", 2)}`;
    case "availability": return `${f("availability", 2)} = 100\\left(1 - \\dfrac{${f("offroad", 2)}}{730.5}\\right)`;
    case "visits": return `${f("visits")} = \\dfrac{${f("first_visits")}}{1 - ${((v.repeat_share ?? 0) / 100).toFixed(4)}}`;
    case "customer_clock": return `${f("customer_clock", 2)} = ${f("workshop", 2)} + ${f("pickup", 2)}`;
    case "spend": return `${f("spend", 0)} = ${f("visits")} \\times ${f("spend_per_visit", 0)}`;
    default: return "";
  }
}

/** Month-on-month change split exactly across the identity's inputs. */
function Decomposition({ id, last, prev }: { id: string; last: Record<string, number | null>; prev: Record<string, number | null> }) {
  const idn = IDENTITIES.find((i) => i.output === id)!;
  if (idn.kind !== "product" && idn.kind !== "sum") return null;
  const b = idn.inputs.map((k) => prev[k]), a = idn.inputs.map((k) => last[k]);
  if ([...a, ...b].some((x) => x === null || x === undefined || !Number.isFinite(x) || (idn.kind === "product" && x === 0))) return null;
  const contrib = idn.kind === "product"
    ? productDecomposition(b as number[], a as number[]).contributions
    : (a as number[]).map((x, i) => x - (b as number[])[i]);
  const total = contrib.reduce((s, c) => s + c, 0);
  const max = Math.max(...contrib.map(Math.abs), 1e-9);
  const lower = NODE[id].better === "lower";
  return (
    <div className="mt-3">
      <p className="mb-2 text-[12.5px]">
        Change vs last month: <b className="tnum text-text">{total >= 0 ? "+" : ""}{total.toFixed(3)}</b>, split exactly by{" "}
        {idn.kind === "product" ? <>log-mean Divisia (LMDI): <Tex>{"\\Delta Y=\\sum_i L(Y_1,Y_0)\\,\\Delta\\ln X_i"}</Tex></> : "term"}
      </p>
      {idn.inputs.map((k, i) => {
        const good = (contrib[i] < 0) === lower;
        return (
          <div key={k} className="mb-1 grid grid-cols-[1fr_2fr_auto] items-center gap-2 text-[12.5px]">
            <span className="truncate">{NODE[k].label}</span>
            <div className="relative h-2 rounded-full bg-panel-2">
              <div className="absolute top-0 h-2 rounded-full" style={{
                left: contrib[i] < 0 ? `${50 - (50 * Math.abs(contrib[i])) / max}%` : "50%",
                width: `${(50 * Math.abs(contrib[i])) / max}%`, background: good ? "var(--good)" : "var(--bad)",
              }} />
            </div>
            <span className="tnum w-16 text-right">{contrib[i] >= 0 ? "+" : ""}{contrib[i].toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Regression({ m }: { m: FittedModel }) {
  const f = m.fit;
  const out = NODE[m.output];
  if (!f) return <Block title="Measured drivers">Not enough data to fit.</Block>;
  const eq = `\\hat{${out.symbol}} = ${f.coef[0].toFixed(2)} ${m.drivers.map((d, i) => `${f.coef[i + 1] < 0 ? "-" : "+"} ${Math.abs(f.coef[i + 1]).toFixed(3)}\\,${NODE[d].symbol}`).join(" ")}`;
  return (
    <Block title="Measured drivers (multiple OLS)">
      <p className="mb-2">{m.why}</p>
      <Tex block>{eq}</Tex>
      <table className="tnum mt-2 w-full text-[12px]">
        <thead className="text-faint">
          <tr><th className="text-left font-medium">Driver</th><th className="text-right font-medium">β</th><th className="text-right font-medium">SE</th>
            <th className="text-right font-medium">t</th><th className="text-right font-medium">p</th><th className="text-right font-medium">95% CI</th></tr>
        </thead>
        <tbody>
          {m.drivers.map((d, i) => {
            const s = strength(f.p[i + 1], 0.5);
            return (
              <tr key={d} className="border-t border-border">
                <td className="py-1.5 text-text">{NODE[d].label}</td>
                <td className="text-right text-text">{f.coef[i + 1].toFixed(3)}<span className="text-accent-ink">{s.stars}</span></td>
                <td className="text-right">{f.se[i + 1].toFixed(3)}</td>
                <td className="text-right">{f.t[i + 1].toFixed(2)}</td>
                <td className="text-right">{pFmt(f.p[i + 1])}</td>
                <td className="text-right">[{f.ci[i + 1][0].toFixed(3)}, {f.ci[i + 1][1].toFixed(3)}]</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[12px]">
        <Tex>{`R^2 = ${f.r2.toFixed(3)},\\; \\bar R^2 = ${f.adjR2.toFixed(3)},\\; F = ${f.f.toFixed(1)},\\; n = ${f.n}`}</Tex>
        <span className="ml-1 text-faint">· * p&lt;.05 ** p&lt;.01 *** p&lt;.001</span>
      </p>
      <p className="mt-1 text-[12px] text-faint">
        <Tex>{"\\hat\\beta=(X^\\top X)^{-1}X^\\top y,\\;\\operatorname{Var}(\\hat\\beta)=s^2(X^\\top X)^{-1}"}</Tex>. Measured association on this fleet, not proof of cause.
      </p>
    </Block>
  );
}

// ------------------------------------------------------------------ what-if
function Simulator({ base, models }: { base: Record<string, number | null>; models: FittedModel[] }) {
  const [lv, setLv] = useState<Record<string, number>>({});
  const sim = useMemo(() => simulate(base, models, lv), [base, models, lv]);
  const OUT = ["offroad", "availability", "per_visit", "workshop", "visits", "key_to_key", "csat", "low_rating", "goodwill", "spend"];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card title="Levers" right={<button className="text-[12.5px] text-accent-ink hover:underline" onClick={() => setLv({})}>Reset</button>}>
        {LEVERS.map((l) => (
          <label key={l.id} className="mb-3.5 block">
            <span className="flex justify-between text-[13px]">
              <span>{l.label}</span>
              <span className="tnum font-medium text-accent-ink">{(lv[l.id] ?? 0) > 0 ? "+" : ""}{(lv[l.id] ?? 0).toFixed(1)} {l.unit}</span>
            </span>
            <input type="range" disabled={base[l.id] == null} min={l.min} max={l.max} step={l.step} value={lv[l.id] ?? 0} className="mt-1 w-full accent-[var(--accent)] disabled:opacity-30"
              onChange={(e) => setLv({ ...lv, [l.id]: Number(e.target.value) })} />
          </label>
        ))}
        {sim.constrained.length > 0 && <p role="status" className="mb-3 text-[12px] text-warn">Physical limits applied: {sim.constrained.map((id) => NODE[id].label).join(", ")}. Downstream identities use the bounded inputs.</p>}
        {!sim.feasible && <p role="alert" className="mb-3 text-[12px] text-bad">Infeasible scenario: service hours exceed the available fleet-hours. Review the input assumptions before making a decision.</p>}
        <p className="text-[12px] leading-relaxed text-faint">
          Propagation: <Tex>{"\\Delta y=\\sum_i \\hat\\beta_i\\,\\Delta x_i"}</Tex> along measured links (first order), then every identity is
          re-evaluated exactly. Only drivers significant at p &lt; 0.05 are passed on. First visits are held fixed, so a
          lower comeback share means fewer visits.
        </p>
      </Card>
      <Card title="Effect on the network" sub="Exploratory scenario, not a causal forecast. Baseline follows the selected region and report month.">
        <table className="tnum w-full text-[13px]">
          <thead className="text-[12px] text-faint">
            <tr><th className="text-left font-medium">Metric</th><th className="text-right font-medium">Now</th>
              <th className="text-right font-medium">Simulated</th><th className="w-[38%] text-right font-medium">Change</th></tr>
          </thead>
          <tbody>
            {OUT.map((id) => {
              const d = sim.delta[id] ?? 0;
              const good = Math.abs(d) < 1e-9 ? null : (d < 0) === (NODE[id].better === "lower");
              const rel = base[id] ? Math.min(Math.abs(d / (base[id] as number)) * 400, 100) : 0;
              return (
                <tr key={id} className="border-t border-border">
                  <td className="py-2">{NODE[id].label}</td>
                  <td className="text-right text-muted">{val(id, base[id])}</td>
                  <td className="text-right font-medium">{val(id, sim.values[id])}</td>
                  <td className="pl-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-panel-2">
                        <div className="ml-auto h-1.5 rounded-full" style={{ width: `${rel}%`, background: good === null ? "var(--faint)" : good ? "var(--good)" : "var(--bad)" }} />
                      </div>
                      <span className="w-20 text-right" style={{ color: good === null ? "var(--muted)" : good ? "var(--good)" : "var(--bad)" }}>
                        {d > 0.5 * 10 ** -NODE[id].decimals ? "+" : ""}{fmt(d, NODE[id].decimals)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ correlation matrix
function Corr({ rows }: { rows: ReturnType<typeof usePanel>["all"] }) {
  const ids = NODES.filter((n) => n.group !== "licence" && n.id !== "open").map((n) => n.id);
  const m = useMemo(() => correlationMatrix(rows, ids), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = m.flatMap((row, i) => row.map((r, j) => [j, i, r === null ? null : Number(r.toFixed(2))]));
  return (
    <Chart height={560} option={(dark) => ({
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: { formatter: (x: unknown) => { const d = (x as { data: [number, number, number] }).data; return `${NODE[ids[d[1]]].label} × ${NODE[ids[d[0]]].label}\nr = ${d[2]}`; } },
      xAxis: { type: "category", data: ids.map((i) => NODE[i].label), axisLabel: { rotate: 45, fontSize: 10, interval: 0 }, splitArea: { show: false } },
      yAxis: { type: "category", data: ids.map((i) => NODE[i].label), axisLabel: { fontSize: 10, interval: 0 }, inverse: true },
      visualMap: { min: -1, max: 1, show: false, inRange: { color: dark ? ["#a3485a", "#171b29", "#5b5fc7"] : ["#f2a7b1", "#f8f9fc", "#a5b4fc"] } },
      series: [{ type: "heatmap", data, label: { show: true, fontSize: 9, color: dark ? "#e8eaf3" : "#0f1222", formatter: (x: unknown) => {
        const v = (x as { data: [number, number, number | null] }).data[2]; return v === null ? "" : Math.abs(v) >= 0.3 ? v.toFixed(1) : ""; } },
        itemStyle: { borderColor: dark ? "#11141f" : "#fff", borderWidth: 1 } }],
    })} />
  );
}

// ------------------------------------------------------------------ job-level evidence
function Evidence() {
  const { region } = useEngine();
  const w = regionWhere(region, "AND");
  const kk = useSql<{ k: number; low: boolean }>(`SELECT key_to_key_h AS k, is_low AS low FROM mart_job_outcomes WHERE is_low IS NOT NULL AND key_to_key_h BETWEEN 0 AND 400${w}`);
  const bins = useSql<{ b: number; k: number; rate: number; n: number }>(`
    SELECT ntile AS b, avg(key_to_key_h) AS k, 100 * avg(is_low::INT) AS rate, count(*) AS n FROM (
      SELECT key_to_key_h, is_low, ntile(12) OVER (ORDER BY key_to_key_h) AS ntile FROM mart_job_outcomes
      WHERE is_low IS NOT NULL AND key_to_key_h BETWEEN 0 AND 400${w}) GROUP BY 1 ORDER BY 1`);
  const rr = useSql<{ rep: boolean; n: number; gw: number; m: number; v: number }>(`
    SELECT is_repeat_visit AS rep, count(*) AS n, count(*) FILTER (WHERE has_goodwill) AS gw,
           avg(goodwill_amount) AS m, var_samp(goodwill_amount) AS v
    FROM mart_job_outcomes WHERE job_type IN ('Repair', 'Warranty')${w} GROUP BY 1`);
  const pw = useSql<{ x: number; y: number; s: boolean }>(`
    SELECT parts_wait_hours AS x, workshop_h AS y, hash(work_order_id) % 25 = 0 AS s FROM mart_job_outcomes
    WHERE parts_wait_hours IS NOT NULL AND workshop_h IS NOT NULL${w}`);

  const lg = useMemo(() => (kk.data ? logistic(kk.data.map((r) => r.k), kk.data.map((r) => r.low)) : null), [kk.data]);
  const fit = useMemo(() => (pw.data ? ols(pw.data.map((r) => r.x), pw.data.map((r) => r.y)) : null), [pw.data]);
  const g1 = rr.data?.find((r) => r.rep), g0 = rr.data?.find((r) => !r.rep);
  const risk = g1 && g0 ? riskRatio(g1.gw, g1.n, g0.gw, g0.n) : null;
  const wt = g1 && g0 ? welchSummary(g1.m, g1.v, g1.n, g0.m, g0.v, g0.n) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Waiting creates detractors" sub="P(1-2★) by key-to-key hours, logistic regression">
        {lg && bins.data ? (
          <>
            <Chart height={220} option={() => ({
              grid: { left: 4, right: 8, top: 20, bottom: 4, containLabel: true },
              tooltip: { trigger: "axis" },
              legend: { data: ["observed (12 bins)", "fitted"] },
              xAxis: { type: "value", name: "key-to-key h", nameLocation: "middle", nameGap: 22, min: 0 },
              yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
              series: [
                { name: "observed (12 bins)", type: "scatter", symbolSize: 8, data: bins.data!.map((b) => [Number(b.k.toFixed(1)), Number(b.rate.toFixed(2))]) },
                { name: "fitted", type: "line", smooth: true, symbol: "none", lineStyle: { width: 2 },
                  data: Array.from({ length: 41 }, (_, i) => { const x = (i / 40) * Math.max(...bins.data!.map((b) => b.k)); return [Number(x.toFixed(1)), Number((100 / (1 + Math.exp(-(lg.b0 + lg.b1 * x)))).toFixed(2))]; }) },
              ],
            })} />
            <div className="mt-2 text-[12.5px] text-muted">
              <Tex>{`\\Pr(L)=\\sigma(${lg.b0.toFixed(2)} + ${lg.b1.toFixed(4)}\\,K)`}</Tex>
              <p className="mt-1.5">Odds ratio per +10 h: <b className="tnum text-text">{Math.exp(10 * lg.b1).toFixed(2)}</b>{" "}
                [{Math.exp(10 * Math.log(lg.ci[0])).toFixed(2)}, {Math.exp(10 * Math.log(lg.ci[1])).toFixed(2)}], z = {lg.z.toFixed(1)}, p {pFmt(lg.p)}, n = {lg.n.toLocaleString()}</p>
            </div>
          </>
        ) : kk.error ? <p role="alert" className="text-sm text-bad">{kk.error}</p> : kk.data ? <p className="py-10 text-sm text-muted">Not enough varied, rated work orders to fit this relationship.</p> : <Skeleton height={260} />}
      </Card>

      <Card title="Fix it once, or pay" sub="Goodwill on repairs: comebacks vs first visits">
        {risk && wt ? (
          <>
            <Chart height={220} option={() => ({
              grid: { left: 4, right: 8, top: 20, bottom: 4, containLabel: true },
              tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
              xAxis: { type: "category", data: ["First visit", "Comeback"] },
              yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
              series: [{ type: "bar", barWidth: "45%", data: [
                { value: Number((100 * risk.p0).toFixed(2)), itemStyle: { color: "#94A3B8", borderRadius: [3, 3, 0, 0] } },
                { value: Number((100 * risk.p1).toFixed(2)), itemStyle: { color: "#E05A6B", borderRadius: [3, 3, 0, 0] } }],
                label: { show: true, position: "top", formatter: "{c}%" } }],
            })} />
            <div className="mt-2 text-[12.5px] text-muted">
              <Tex>{`RR=\\dfrac{${(100 * risk.p1).toFixed(1)}\\%}{${(100 * risk.p0).toFixed(1)}\\%}=${risk.rr.toFixed(1)}`}</Tex>
              <p className="mt-1.5">95% CI [{risk.ci[0].toFixed(1)}, {risk.ci[1].toFixed(1)}], p {pFmt(risk.p)}. Goodwill per job +${wt.diff.toFixed(1)}{" "}
                (Welch t = {wt.t.toFixed(1)}, df = {wt.df.toFixed(0)}, p {pFmt(wt.p)}); n = {(risk.n1 + risk.n0).toLocaleString()}</p>
            </div>
          </>
        ) : rr.error ? <p role="alert" className="text-sm text-bad">{rr.error}</p> : rr.data ? <p className="py-10 text-sm text-muted">Both comeback and first-visit groups need enough observations for comparison.</p> : <Skeleton height={260} />}
      </Card>

      <Card title="Late parts move the workshop clock" sub="Workshop hours vs parts-wait hours, every job (1 in 25 plotted)">
        {fit && pw.data ? (
          <>
            <Chart height={220} option={(dark) => ({
              grid: { left: 4, right: 8, top: 20, bottom: 4, containLabel: true },
              xAxis: { type: "value", name: "parts wait h", nameLocation: "middle", nameGap: 22 },
              yAxis: { type: "value", name: "workshop h" },
              series: [
                { type: "scatter", symbolSize: 3, itemStyle: { color: dark ? "rgba(129,140,248,.35)" : "rgba(99,102,241,.3)" },
                  data: pw.data!.filter((r) => r.s).map((r) => [r.x, r.y]) },
                { type: "line", symbol: "none", lineStyle: { width: 2, color: dark ? "#c9cde0" : "#2b3150" },
                  data: [0, Math.max(...pw.data!.map((r) => r.x))].map((x) => [x, fit.intercept + fit.slope * x]) },
              ],
            })} />
            <div className="mt-2 text-[12.5px] text-muted">
              <Tex>{`\\hat W = ${fit.intercept.toFixed(2)} + ${fit.slope.toFixed(3)}\\,w_{parts}`}</Tex>
              <p className="mt-1.5">β 95% CI [{fit.ci[0].toFixed(3)}, {fit.ci[1].toFixed(3)}], r = {fit.r.toFixed(3)}, R² = {fit.r2.toFixed(3)}, p {pFmt(fit.p)}, n = {fit.n.toLocaleString()}</p>
            </div>
          </>
        ) : pw.error ? <p role="alert" className="text-sm text-bad">{pw.error}</p> : pw.data ? <p className="py-10 text-sm text-muted">Not enough varied parts-wait and workshop observations to fit this relationship.</p> : <Skeleton height={260} />}
      </Card>
    </div>
  );
}

