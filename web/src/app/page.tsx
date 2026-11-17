"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, rag, ragColor, SectionTitle, Skeleton, Tile, type Rag } from "@/components/ui";
import { usePanel } from "@/components/use-panel";
import { NODE } from "@/lib/metrics";

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
  const { region, status } = useEngine();
  const p = usePanel();
  const sc = useSql<Record<string, string | number>>(`SELECT * FROM mart_exec_scorecard ORDER BY region`);
  const lb = useSql<{ site_name: string; ops_score: number; tier: string; badges: string; rank_change: number }>(
    `SELECT site_name, ops_score, tier, badges, rank_change FROM mart_leaderboard${regionWhere(region)} ORDER BY ops_score`);
  const spark = (id: string) => p.series.map((s) => s.v[id]);
  const north = p.last?.v.offroad ?? null;

  return (
    <>
      <PageHeader eyebrow={region ?? "Network"} title="Fleet operations, as one system">
        Every number below is computed in your browser by the same tested SQL pipeline, and every KPI is connected to the north
        star by exact algebra or a measured driver. Open the <Link href="/network/" className="text-accent underline-offset-2 hover:underline">metric network</Link> to see the maths.
      </PageHeader>

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
