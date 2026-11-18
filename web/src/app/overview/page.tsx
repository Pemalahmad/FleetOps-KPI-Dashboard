"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import type { EChartsOption } from "echarts";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { attention, Card, Delta, KpiRow, Metric, PageHeader, rag, SectionTitle, Skeleton, type Rag } from "@/components/ui";
import { usePanel } from "@/components/use-panel";
import { NODE } from "@/lib/metrics";

type Extra = { utilization: number | null; first_time_fix: number | null; pm: number | null; backlog: number | null; aged7: number | null;
  reg_valid: number | null; ins_valid: number | null; tco_km: number | null; co2_km: number | null };

/** Network (or region) values for KPIs that are not in the monthly panel, weighted the same way as the scorecard. */
const extraSql = (region: string | null) => {
  const w = (col = "region") => regionWhere(region, "AND", col);
  return `SELECT
  (SELECT sum(utilization_pct * active_vehicles) / nullif(sum(active_vehicles), 0) FROM mart_region_month_kpis WHERE month_start = report_month()${w()}) AS utilization,
  (SELECT 100 * (1 - avg(repeat_visit::INT)) FROM stg_work_orders WHERE job_type <> 'Recall' AND closed_at IS NOT NULL
     AND date_trunc('month', closed_at)::DATE = report_month()${w("vehicle_region")}) AS first_time_fix,
  (SELECT 100.0 * sum(vehicles - overdue) / nullif(sum(vehicles), 0) FROM mart_pm_compliance WHERE true${w()}) AS pm,
  (SELECT sum(open_jobs) / nullif(sum(daily_closures), 0) FROM mart_backlog WHERE true${w()}) AS backlog,
  (SELECT sum(age_7d_plus) FROM mart_backlog WHERE true${w()}) AS aged7,
  (SELECT 100.0 * sum(vehicles) FILTER (WHERE document = 'Registration' AND status IN ('Valid', 'Expiring'))
     / nullif(sum(vehicles) FILTER (WHERE document = 'Registration' AND status <> 'Unknown'), 0) FROM mart_compliance_status WHERE true${w()}) AS reg_valid,
  (SELECT 100.0 * sum(vehicles) FILTER (WHERE document = 'Insurance' AND status IN ('Valid', 'Expiring'))
     / nullif(sum(vehicles) FILTER (WHERE document = 'Insurance' AND status <> 'Unknown'), 0) FROM mart_compliance_status WHERE true${w()}) AS ins_valid,
  (SELECT (sum(energy_cost) + sum(maintenance_cost) + sum(depreciation)) / nullif(sum(km), 0) FROM int_vehicle_month_economics WHERE true${w()}) AS tco_km,
  (SELECT 1000 * sum(co2_kg) / nullif(sum(km), 0) FROM int_vehicle_month_economics WHERE true${w()}) AS co2_km`;
};

type WallItem = { node: string } | { label: string; key: keyof Extra; unit: string; decimals: number; better: "higher" | "lower"; target?: string; hint: string };
const WALL: { title: string; sub: string; items: WallItem[] }[] = [
  { title: "Fleet & uptime", sub: "Is the fleet on the road?", items: [
    { node: "availability" },
    { label: "Utilisation", key: "utilization", unit: "%", decimals: 1, better: "higher", target: "utilization_pct", hint: "Share of available vehicle time in use" },
    { node: "visits" }, { node: "first_visits" },
    { label: "PM compliance", key: "pm", unit: "%", decimals: 1, better: "higher", target: "pm_compliance_pct", hint: "Vehicles not overdue for preventive maintenance" },
  ] },
  { title: "Compliance", sub: "Licence to operate", items: [
    { label: "Registration valid", key: "reg_valid", unit: "%", decimals: 1, better: "higher", target: "registration_valid_pct", hint: "Active vehicles with a valid or expiring (not expired) registration" },
    { label: "Insurance valid", key: "ins_valid", unit: "%", decimals: 1, better: "higher", target: "insurance_valid_pct", hint: "Active vehicles with valid or expiring insurance" },
    { node: "fines" }, { node: "recalls" },
  ] },
  { title: "Workshop", sub: "How fast and how well work gets done", items: [
    { node: "per_visit" }, { node: "workshop" }, { node: "productivity" }, { node: "parts" },
    { label: "First-time fix", key: "first_time_fix", unit: "%", decimals: 1, better: "higher", target: "first_time_fix_pct", hint: "Visits closed this month that did not come back" },
    { node: "repeat_repair" }, { node: "repeat_share" },
    { label: "Backlog", key: "backlog", unit: "days", decimals: 2, better: "lower", target: "backlog_days", hint: "Open jobs divided by average daily completions (last 28 days)" },
    { label: "Open jobs older than 7 days", key: "aged7", unit: "", decimals: 0, better: "lower", hint: "Work orders still open after a week" },
  ] },
  { title: "Customer clock", sub: "The driver's side of every visit", items: [
    { node: "key_to_key" }, { node: "customer_clock" }, { node: "pickup" }, { node: "back" }, { node: "open" }, { node: "csat" }, { node: "low_rating" },
  ] },
  { title: "Cost", sub: "What the fleet costs to run", items: [
    { node: "spend" }, { node: "spend_per_visit" }, { node: "goodwill" },
    { label: "Total cost per km", key: "tco_km", unit: "$", decimals: 3, better: "lower", hint: "Energy, maintenance and depreciation over distance driven" },
    { label: "CO₂ per km", key: "co2_km", unit: "g", decimals: 0, better: "lower", hint: "Tailpipe and charging emissions over distance driven" },
  ] },
];

const TILES = ["availability", "key_to_key", "csat", "low_rating", "parts", "repeat_repair", "productivity", "goodwill"];

const SCORE: [string, string, string][] = [
  ["availability_rag", "Availability", "availability_pct"], ["key_to_key_rag", "Key-to-key", "key_to_key_p50_h"],
  ["pickup_rag", "Pick-up", "time_to_pickup_p50_h"], ["back_to_ops_rag", "Back to ops", "back_to_ops_p50_h"],
  ["first_time_fix_rag", "First-time fix", "first_time_fix_pct"], ["repeat_repair_rag", "Repeat repairs", "repeat_repair_pct"],
  ["parts_rag", "Parts on time", "parts_on_time_pct"], ["productivity_rag", "Productivity", "productivity_pct"],
  ["backlog_rag", "Backlog days", "backlog_days"], ["csat_rag", "CSAT", "csat_pct"], ["low_rating_rag", "1-2★", "low_rating_pct"],
  ["goodwill_rag", "Goodwill", "goodwill_pct"], ["cost_rag", "Cost vs budget", "cost_vs_budget_pct"],
  ["pm_rag", "PM compliance", "pm_compliance_pct"], ["registration_rag", "Registration", "registration_valid_pct"],
  ["insurance_rag", "Insurance", "insurance_valid_pct"], ["fines_rag", "Fines /100", "fines_per_100_vehicles"],
];

export default function Overview() {
  const { region, status, log } = useEngine();
  const p = usePanel();
  const sc = useSql<Record<string, string | number>>(`SELECT * FROM mart_exec_scorecard ORDER BY region`);
  const lb = useSql<{ site_name: string; ops_score: number; tier: string; badges: string; rank_change: number }>(
    `SELECT site_name, ops_score, tier, badges, rank_change FROM mart_leaderboard${regionWhere(region)} ORDER BY ops_score`);
  const spark = (id: string) => p.series.map((s) => s.v[id]);
  const ex = useSql<Extra>(extraSql(region));
  const extra = ex.data?.[0] ?? null;
  const targetText = (key?: string) => {
    const t = key ? p.targets[key] : undefined;
    return t ? `Target ${t.direction === "higher" ? "≥" : "≤"} ${t.green.toLocaleString()}` : undefined;
  };
  const north = p.last?.v.offroad ?? null;

  return (
    <>
      <PageHeader eyebrow={region ?? "Network"} title="Fleet operations, as one system">
        Every number below is computed in your browser by the same tested SQL pipeline, and every KPI is connected to the north
        star by exact algebra or a measured driver. Open the <Link href="/network/" className="text-accent underline-offset-2 hover:underline">metric network</Link> to see the maths.
      </PageHeader>

      {log?.mode === "registry" && (
        <Card className="mb-4">
          <p className="text-[13.5px] text-muted">
            <b className="text-text">Your fleet is in registry mode.</b> The <Link href="/fleet/" className="text-accent hover:underline">fleet register</Link>,{" "}
            documents and licence are live. The operating KPIs below need work orders: add your service history on the{" "}
            <Link href="/import/" className="text-accent hover:underline">import page</Link>.
          </p>
        </Card>
      )}

      <section className="ov-hero" aria-label="Headline indicators">
        <div className="ov-north">
          <p className="text-[13px] text-muted">North star · off-road hours per vehicle per month</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum text-[56px] font-semibold leading-none tracking-[-0.045em]">{north === null ? "–" : north.toFixed(1)}</span>
            <span className="text-[18px] text-muted">h</span>
            <span className="text-[12px]"><Delta delta={north !== null && p.prev?.v.offroad != null ? north - p.prev.v.offroad : null} decimals={1} unit="h" better="lower" />
              <span className="ml-1.5 text-faint">vs last month · lower is better</span></span>
          </div>
          <div className="mt-4">
            {p.ready ? (
              <Chart height={140} option={(dark): EChartsOption => {
                const data = spark("offroad");
                return {
                  grid: { left: 0, right: 6, top: 10, bottom: 0, containLabel: true },
                  tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)} h` },
                  xAxis: { type: "category", boundaryGap: false, data: p.series.map((s) => s.month.slice(0, 7)),
                    axisLine: { show: false }, axisLabel: { interval: Math.max(0, Math.ceil(data.length / 4) - 1), fontSize: 10.5, showMinLabel: false,
                      formatter: (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en", { month: "short", year: "2-digit" }) } },
                  yAxis: { type: "value", scale: true, splitNumber: 2, axisLabel: { show: false }, splitLine: { lineStyle: { type: "dashed" } } },
                  series: [{ type: "line", data, smooth: 0.3, symbol: "none", lineStyle: { width: 1.75, color: dark ? "#c9cde0" : "#2b3150" },
                    markPoint: { symbol: "circle", symbolSize: 7, itemStyle: { color: dark ? "#c9cde0" : "#2b3150" }, label: { show: false },
                      data: [{ name: "latest", coord: [data.length - 1, data.at(-1) ?? 0] }] } }],
                };
              }} />
            ) : <Skeleton height={140} />}
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            Visits per vehicle <b className="tnum font-semibold text-text">{p.last?.v.visits?.toFixed(3) ?? "–"}</b> × hours per visit{" "}
            <b className="tnum font-semibold text-text">{p.last?.v.per_visit?.toFixed(1) ?? "–"}</b>. Availability{" "}
            <b className="tnum font-semibold text-text">{p.last?.v.availability?.toFixed(2) ?? "–"}%</b> is the same number from the other side.{" "}
            <Link href="/network/" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">What drives it <ArrowRight size={12} /></Link>
          </p>
        </div>
        <div className="ov-metrics">
          {TILES.map((id) => {
            const n = NODE[id];
            const v = p.last?.v[id] ?? null;
            return (
              <Metric key={id} label={n.label} value={v} unit={n.unit} decimals={n.decimals > 2 ? 2 : n.decimals} prev={p.prev?.v[id]}
                better={n.better} status={rag(v, n.target ? p.targets[n.target] : undefined)} spark={spark(id)} hint={n.meaning} target={targetText(n.target)?.toLowerCase()} />
            );
          })}
        </div>
      </section>

      <SectionTitle sub={`${WALL.reduce((n, g) => n + g.items.length, 0)} indicators for ${region ?? "the network"}, report month. Values in amber or red are off target; the change is against last month.`}>Every KPI</SectionTitle>
      <div className="kpi-wall">
        {WALL.map((g) => (
          <section key={g.title} className="kpi-group">
            <header><h3 className="text-[14px] font-semibold">{g.title}</h3><span className="text-[11.5px] text-muted">{g.sub}</span></header>
            {g.items.map((it) => {
              if ("node" in it) {
                const n = NODE[it.node], v = p.last?.v[it.node] ?? null, t = n.target ? p.targets[n.target] : undefined;
                return <KpiRow key={it.node} label={n.label} value={v} unit={n.unit} decimals={Math.min(n.decimals, 2)} prev={p.prev?.v[it.node]} better={n.better}
                  status={rag(v, t)} spark={spark(it.node)} hint={n.meaning} target={targetText(n.target)} />;
              }
              const v = extra?.[it.key] ?? null;
              return <KpiRow key={it.label} label={it.label} value={v === null ? null : Number(v)} unit={it.unit} decimals={it.decimals} better={it.better}
                status={rag(v === null ? null : Number(v), it.target ? p.targets[it.target] : undefined)} hint={it.hint} target={targetText(it.target)} />;
            })}
          </section>
        ))}
      </div>

      <SectionTitle sub="Every region against every target, report month. Amber and red mark values off target (thresholds from fleet.yml).">Scorecard</SectionTitle>
      <Card className="!p-0">
        {sc.data ? (
          <div className="overflow-x-auto">
            <table className="score-table tnum w-full min-w-[1000px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-panel !text-left">Region</th>
                  {SCORE.map(([, l]) => <th key={l}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {sc.data.filter((r) => !region || r.region === region).map((r) => (
                  <tr key={String(r.region)}>
                    <td className="sticky left-0 z-[1] bg-panel !text-left font-medium">{String(r.region)}</td>
                    {SCORE.map(([k, l, v]) => {
                      const state = (r[k] as Rag) ?? null, val = r[v] as number | null;
                      return (
                        <td key={l} style={{ color: attention(state) }} className={state === "red" ? "font-semibold" : ""}>
                          {val === null || val === undefined ? <span className="text-faint">–</span> : Number(val).toFixed(Math.abs(Number(val)) >= 100 ? 0 : 1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Skeleton height={260} />}
      </Card>

      <SectionTitle sub="Ops Score 0-1,000 from key-to-key, first-time fix, CSAT, productivity and PM compliance. Law 7: recognise in public.">Site league</SectionTitle>
      <Card>
        {lb.data ? (
          <Chart height={Math.max(260, lb.data.length * 30)} option={(dark) => ({
            grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis", axisPointer: { type: "none" } },
            xAxis: { type: "value", max: 1000 },
            yAxis: { type: "category", data: lb.data!.map((r) => r.site_name) },
            series: [{ type: "bar", barWidth: 10, data: lb.data!.map((r) => ({
              value: r.ops_score,
              itemStyle: { borderRadius: [0, 3, 3, 0], color: dark ? "#818cf8" : "#6366f1", opacity: 0.35 + 0.65 * (r.ops_score / 1000) },
            })), label: { show: true, position: "right", color: dark ? "#9097b0" : "#5b6178", fontSize: 11,
              formatter: (x) => `${x.value} · ${lb.data![x.dataIndex].tier}` } }],
          })} />
        ) : <Skeleton />}
      </Card>
      {status === "failed" && <p className="mt-6 text-bad">The pipeline did not finish. See Pipeline for details.</p>}
    </>
  );
}
