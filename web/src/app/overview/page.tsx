"use client";

import Link from "next/link";
import {
  ArrowRight, ClockCountdown, CurrencyDollar, Pulse, RoadHorizon, ShieldCheck,
  SteeringWheel, Truck, Wrench,
} from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import { LivePanel } from "@/components/live";
import { GaugeRow } from "@/components/gauges";
import type { EChartsOption } from "echarts";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { attention, Card, CountIn, Delta, KpiRow, Metric, PageHeader, rag, SectionTitle, Skeleton, type Rag } from "@/components/ui";
import { usePanel } from "@/components/use-panel";
import { NODE } from "@/lib/metrics";

type Extra = { utilization: number | null; first_time_fix: number | null; pm: number | null; backlog: number | null; aged7: number | null;
  reg_valid: number | null; ins_valid: number | null; tco_km: number | null; co2_km: number | null;
  planned: number | null; mdbf: number | null; fuel_l100: number | null; kwh_100: number | null; fuel_flags: number | null; underused: number | null; health: number | null;
  safety: number | null; speeding: number | null; harsh: number | null; idle: number | null; geo: number | null; lic_expired: number | null; not_compliant: number | null };

/** Network (or region) values for KPIs that are not in the monthly panel, weighted the same way as the scorecard. */
const UNPLANNED = "'Repair', 'Collision', 'Tyres', 'Warranty'";
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
  (SELECT 1000 * sum(co2_kg) / nullif(sum(km), 0) FROM int_vehicle_month_economics WHERE true${w()}) AS co2_km,
  (SELECT 100.0 * count(*) FILTER (WHERE job_type = 'Preventive maintenance') / nullif(count(*), 0) FROM stg_work_orders
     WHERE job_type <> 'Recall' AND closed_at IS NOT NULL AND date_trunc('month', closed_at)::DATE = report_month()${w("vehicle_region")}) AS planned,
  (SELECT sum(days_in_service) FROM int_vehicle_months WHERE month_start > report_month() - INTERVAL 12 MONTH${w()})
    / nullif((SELECT count(*) FROM stg_work_orders WHERE job_type IN (${UNPLANNED}) AND key_in_ts >= report_month() - INTERVAL 11 MONTH
       AND key_in_ts < report_month() + INTERVAL 1 MONTH${w("vehicle_region")}), 0) AS mdbf,
  (SELECT 100 * sum(e.q) / nullif(sum(k.km), 0) FROM (SELECT vehicle_id, month_start, sum(quantity) AS q FROM stg_energy
     WHERE energy_type = 'fuel' AND month_start > report_month() - INTERVAL 3 MONTH GROUP BY ALL) e JOIN int_vehicle_months k USING (vehicle_id, month_start) WHERE true${w("k.region")}) AS fuel_l100,
  (SELECT 100 * sum(e.q) / nullif(sum(k.km), 0) FROM (SELECT vehicle_id, month_start, sum(quantity) AS q FROM stg_energy
     WHERE energy_type = 'electricity' AND month_start > report_month() - INTERVAL 3 MONTH GROUP BY ALL) e JOIN int_vehicle_months k USING (vehicle_id, month_start) WHERE true${w("k.region")}) AS kwh_100,
  (WITH vm AS (SELECT e.vehicle_id, e.month_start, k.powertrain, 100 * sum(e.quantity) / nullif(any_value(k.km), 0) AS l100
       FROM stg_energy e JOIN int_vehicle_months k USING (vehicle_id, month_start)
       WHERE e.energy_type = 'fuel' AND e.month_start > report_month() - INTERVAL 3 MONTH AND k.km > 500${w("k.region")} GROUP BY e.vehicle_id, e.month_start, k.powertrain),
     med AS (SELECT powertrain, median(l100) AS m FROM vm GROUP BY 1)
   SELECT count(*) FROM vm JOIN med USING (powertrain) WHERE l100 > 1.5 * m) AS fuel_flags,
  (WITH v3 AS (SELECT vehicle_id, powertrain, sum(km) AS km FROM int_vehicle_months WHERE month_start > report_month() - INTERVAL 3 MONTH${w()} GROUP BY ALL),
     med AS (SELECT powertrain, median(km) AS m FROM v3 GROUP BY 1)
   SELECT count(*) FROM v3 JOIN med USING (powertrain) WHERE km < 0.25 * m) AS underused,
  (WITH u AS (SELECT vehicle_id, count(*) AS n, bool_or(is_open) AS open_now,
       bool_or(repeat_visit AND key_in_ts >= snapshot_ts() - INTERVAL 90 DAY) AS rep
       FROM stg_work_orders WHERE job_type IN (${UNPLANNED}) AND key_in_ts >= snapshot_ts() - INTERVAL 365 DAY GROUP BY 1)
   SELECT avg(greatest(0, 100 - CASE WHEN u.open_now THEN 20 ELSE 0 END - CASE WHEN p.pm_state = 'Overdue' THEN 20 ELSE 0 END
       - CASE WHEN u.rep THEN 15 ELSE 0 END - least(25, 5 * coalesce(u.n, 0)) - CASE WHEN v.age_months > 60 THEN 10 ELSE 0 END
       - CASE WHEN v.registration_status = 'Expired' OR v.insurance_status = 'Expired' THEN 10 ELSE 0 END))
   FROM stg_vehicles v LEFT JOIN u USING (vehicle_id) LEFT JOIN int_pm_status p USING (vehicle_id) WHERE v.is_active${w("v.region")}) AS health,
  (SELECT avg(safety_score) FROM mart_driver_scores WHERE km > 0${w()}) AS safety,
  (SELECT 100.0 * sum(speeding_per_100km * km / 100) / nullif(sum(km), 0) FROM mart_driver_scores WHERE km > 0${w()}) AS speeding,
  (SELECT 100.0 * sum(harsh_per_100km * km / 100) / nullif(sum(km), 0) FROM mart_driver_scores WHERE km > 0${w()}) AS harsh,
  (SELECT 100.0 * sum(idle_minutes) / nullif(sum(idle_minutes + driving_minutes), 0) FROM stg_trips
     WHERE start_ts >= snapshot_ts() - to_days(CAST(cfg_num('alert_window_days') AS INTEGER))${w()}) AS idle,
  (SELECT count(*) FROM mart_alerts WHERE rule = 'geofence'${w()}) AS geo,
  (SELECT count(*) FROM mart_driver_scores WHERE is_active AND licence_status = 'Expired'${w()}) AS lic_expired,
  (SELECT count(*) FROM mart_driver_compliance WHERE is_active AND compliance_status = 'Not compliant'${w()}) AS not_compliant`;
};

type WallItem = { node: string } | { label: string; key: keyof Extra; unit: string; decimals: number; better: "higher" | "lower"; target?: string; hint: string };
const WALL: { title: string; sub: string; items: WallItem[] }[] = [
  { title: "Fleet & uptime", sub: "Is the fleet on the road?", items: [
    { node: "availability" },
    { label: "Utilisation", key: "utilization", unit: "%", decimals: 1, better: "higher", target: "utilization_pct", hint: "Share of available vehicle time in use" },
    { node: "visits" }, { node: "first_visits" },
    { label: "PM compliance", key: "pm", unit: "%", decimals: 1, better: "higher", target: "pm_compliance_pct", hint: "Vehicles not overdue for preventive maintenance" },
  ] },
  { title: "Maintenance & health", sub: "Planned work, breakdowns and condition", items: [
    { label: "Fleet health score", key: "health", unit: "", decimals: 0, better: "higher", hint: "0-100 per active vehicle, averaged: 100 minus 20 for an open unplanned job, 20 for overdue PM, 15 for a comeback in 90 days, 5 per unplanned visit in a year (up to 25), 10 if older than five years, 10 for an expired document" },
    { label: "Planned maintenance share", key: "planned", unit: "%", decimals: 1, better: "higher", hint: "Preventive-maintenance jobs as a share of all non-recall jobs closed this month" },
    { label: "Days between unplanned visits", key: "mdbf", unit: "days", decimals: 0, better: "higher", hint: "Vehicle-days in service over the last 12 months divided by repair, collision, tyre and warranty visits" },
    { label: "Under-used vehicles", key: "underused", unit: "", decimals: 0, better: "lower", hint: "Vehicles that drove under a quarter of the median distance for their powertrain over the last three months: candidates to redeploy or retire" },
  ] },
  { title: "Drivers & trips", sub: "From telematics exports", items: [
    { label: "Driver safety score", key: "safety", unit: "", decimals: 0, better: "higher", hint: "Average 0-100 score of drivers with trips in the alert window (speeding, harsh driving, idling and zone exits against the fleet.yml limits)" },
    { label: "Speeding", key: "speeding", unit: "/100 km", decimals: 2, better: "lower", hint: "Speeding events per 100 km driven, alert window" },
    { label: "Harsh driving", key: "harsh", unit: "/100 km", decimals: 2, better: "lower", hint: "Harsh braking, acceleration and cornering per 100 km, alert window" },
    { label: "Idle time", key: "idle", unit: "%", decimals: 1, better: "lower", hint: "Idle minutes as a share of engine-on time, alert window" },
    { label: "Vehicles that left their zone", key: "geo", unit: "", decimals: 0, better: "lower", hint: "Vehicles with at least the configured number of geofence exits, alert window" },
    { label: "Drivers not compliant", key: "not_compliant", unit: "", decimals: 0, better: "lower", hint: "Active drivers with an expired licence or a licence class that does not cover their vehicle" },
    { label: "Drivers with an expired licence", key: "lic_expired", unit: "", decimals: 0, better: "lower", hint: "Active drivers whose licence expiry date has passed" },
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
    { label: "Fuel use", key: "fuel_l100", unit: "L/100 km", decimals: 1, better: "lower", hint: "Litres bought per 100 km driven by vehicles that refuel, last three months" },
    { label: "Electricity use", key: "kwh_100", unit: "kWh/100 km", decimals: 1, better: "lower", hint: "kWh charged per 100 km driven by vehicles that charge, last three months" },
    { label: "Unusual fuel months", key: "fuel_flags", unit: "", decimals: 0, better: "lower", hint: "Vehicle-months using over 1.5× the median litres per 100 km for their powertrain (possible leaks, theft or wrong fuel card), last three months" },
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

function GroupIcon({ title }: { title: string }) {
  const props = { size: 17, weight: "duotone" as const };
  if (title.startsWith("Fleet")) return <Truck {...props} />;
  if (title.startsWith("Maintenance")) return <Wrench {...props} />;
  if (title.startsWith("Drivers")) return <SteeringWheel {...props} />;
  if (title === "Compliance") return <ShieldCheck {...props} />;
  if (title === "Workshop") return <Pulse {...props} />;
  if (title.startsWith("Customer")) return <ClockCountdown {...props} />;
  return <CurrencyDollar {...props} />;
}

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
      <PageHeader asOf art="analytics" backdrop eyebrow={region ?? "Network"} title="Fleet operations, as one system">
        Every number below is computed in your browser by the same tested SQL pipeline, and every KPI is connected to the north
        star by exact algebra or a measured driver. Open the <Link href="/network/" className="text-accent-ink underline-offset-2 hover:underline">metric network</Link> to see the maths.
      </PageHeader>

      {log?.mode === "registry" && (
        <Card className="mb-4">
          <p className="text-[13.5px] text-muted">
            <b className="text-text">Your fleet is in registry mode.</b> The <Link href="/fleet/" className="text-accent-ink hover:underline">fleet register</Link>,{" "}
            documents and licence are live. The operating KPIs below need work orders: add your service history on the{" "}
            <Link href="/import/" className="text-accent-ink hover:underline">import page</Link>.
          </p>
        </Card>
      )}

      <LivePanel focus="fleet" />
      <section className="ov-hero" aria-label="Headline indicators">
        <div className="ov-north">
          <div className="ov-north-label">
            <span className="ov-north-icon" aria-hidden="true"><RoadHorizon size={18} weight="duotone" /></span>
            <span><b>North star</b><small>Off-road hours per vehicle per month</small></span>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tile-figure text-[60px]">{north === null ? "–" : <CountIn value={north} decimals={1} />}</span>
            <span className="text-[18px] text-muted">h</span>
            <span className="text-[12px]"><Delta delta={north !== null && p.prev?.v.offroad != null ? north - p.prev.v.offroad : null} decimals={1} unit="h" better="lower" />
              <span className="ml-1.5 text-muted">vs last month · lower is better</span></span>
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
            <Link href="/network/" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">What drives it <ArrowRight size={12} /></Link>
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

      <GaugeRow label="Headline gauges" items={[
        { label: "Utilisation", value: extra?.utilization, target: 70 },
        { label: "PM compliance", value: extra?.pm, target: 95, near: 3 },
        { label: "First-time fix", value: extra?.first_time_fix, target: 98.5, near: 2 },
        { label: "Registration valid", value: extra?.reg_valid, target: 99, near: 2 },
        { label: "Insurance valid", value: extra?.ins_valid, target: 99, near: 2 },
        { label: "Fleet health", value: extra?.health, target: 80, near: 10, detail: "Score out of 100" },
      ]} />

      <SectionTitle sub={`${WALL.reduce((n, g) => n + g.items.length, 0)} indicators for ${region ?? "the network"}, report month. Values in amber or red are off target; the change is against last month.`}>Every KPI</SectionTitle>
      <div className="kpi-wall">
        {WALL.map((g) => (
          <section key={g.title} className="kpi-group">
            <header>
              <span className="kpi-group-icon" aria-hidden="true"><GroupIcon title={g.title} /></span>
              <span className="min-w-0 flex-1"><h3 className="text-[14px] font-semibold">{g.title}</h3><span className="block text-[11.5px] text-muted">{g.sub}</span></span>
            </header>
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
                        <td key={l} data-state={state ?? undefined} style={{ color: attention(state) }} className={`score-cell ${state === "red" ? "font-semibold" : ""}`}>
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
