"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, KpiRow, PageHeader, rag, ragColor, SectionTitle, Skeleton, Tile, type Rag } from "@/components/ui";
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

      <div className="grid gap-4 lg:grid-cols-[1.15fr_2fr]">
        <div className="card relative overflow-hidden p-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-bad">North star</p>
          <p className="mt-1 text-[14px] text-muted">Off-road hours per vehicle per month</p>
          <div className="tnum mt-3 text-[56px] font-bold leading-none">{north === null ? "–" : north.toFixed(1)}<span className="ml-1 text-[22px] font-medium text-muted">h</span></div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            = visits per vehicle <b className="tnum text-text">{p.last?.v.visits?.toFixed(3) ?? "–"}</b> × hours per visit{" "}
            <b className="tnum text-text">{p.last?.v.per_visit?.toFixed(1) ?? "–"}</b>. Availability{" "}
            <b className="tnum text-text">{p.last?.v.availability?.toFixed(2) ?? "–"}%</b> is the same number seen from the other side.
          </p>
          <div className="mt-4">
            {p.ready ? (
              <Chart height={130} option={(dark) => ({
                grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: true },
                tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)} h` },
                xAxis: { type: "category", data: p.series.map((s) => s.month.slice(0, 7)), axisLabel: { show: false } },
                yAxis: { type: "value", scale: true, splitNumber: 2 },
                series: [{ type: "line", data: spark("offroad"), smooth: true, symbol: "none", lineStyle: { width: 2.5, color: dark ? "#fb7185" : "#e11d48" },
                  areaStyle: { color: dark ? "rgba(251,113,133,.12)" : "rgba(225,29,72,.08)" } }],
              })} />
            ) : <Skeleton height={130} />}
          </div>
          <Link href="/network/" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:gap-2.5 transition-all">
            See what drives it <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TILES.map((id) => {
            const n = NODE[id];
            const v = p.last?.v[id] ?? null;
            return (
              <Tile key={id} label={n.label} value={v} unit={n.unit} decimals={n.decimals > 2 ? 2 : n.decimals} prev={p.prev?.v[id]}
                better={n.better} status={rag(v, n.target ? p.targets[n.target] : undefined)} spark={spark(id)} hint={n.meaning} />
            );
          })}
        </div>
      </div>

      <SectionTitle sub={`${WALL.reduce((n, g) => n + g.items.length, 0)} indicators for ${region ?? "the network"}, report month. The bar shows the target state; the change is against last month.`}>Every KPI</SectionTitle>
      <div className="kpi-wall">
        {WALL.map((g) => (
          <section key={g.title} className="kpi-panel">
            <header><h3 className="text-[14px] font-semibold">{g.title}</h3><span className="text-[11.5px] text-faint">{g.sub}</span></header>
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

      <SectionTitle sub="Every region against every target, report month. Green / amber / red come from fleet.yml.">Scorecard</SectionTitle>
      <Card>
        {sc.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-1 text-[12.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel text-left font-medium text-muted">Region</th>
                  {SCORE.map(([, l]) => <th key={l} className="px-1 text-center font-medium text-muted">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {sc.data.filter((r) => !region || r.region === region).map((r) => (
                  <tr key={String(r.region)}>
                    <td className="sticky left-0 bg-panel pr-2 font-medium">{String(r.region)}</td>
                    {SCORE.map(([k, l, v]) => {
                      const c = ragColor((r[k] as Rag) ?? null);
                      const val = r[v] as number | null;
                      return (
                        <td key={l} className="tnum rounded-md px-1.5 py-2 text-center font-medium"
                          style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>
                          {val === null || val === undefined ? "–" : Number(val).toFixed(Math.abs(Number(val)) >= 100 ? 0 : 1)}
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
            series: [{ type: "bar", barWidth: "60%", data: lb.data!.map((r) => ({
              value: r.ops_score,
              itemStyle: { borderRadius: [0, 6, 6, 0], color: { Platinum: "#8B5CF6", Gold: "#F59E0B", Silver: "#94A3B8", Bronze: "#B45309" }[r.tier] ?? "#6366F1" },
            })), label: { show: true, position: "right", color: dark ? "#9097b0" : "#5b6178", fontSize: 11,
              formatter: (x) => `${x.value} · ${lb.data![x.dataIndex].tier}` } }],
          })} />
        ) : <Skeleton />}
      </Card>
      {status === "failed" && <p className="mt-6 text-bad">The pipeline did not finish. See Pipeline for details.</p>}
    </>
  );
}
