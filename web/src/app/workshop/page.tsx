"use client";

import { Chart, PALETTE, RISK_SCALE, STATUS } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { contextLines, linesBy, monthLabels } from "@/lib/chart-helpers";

export default function WorkshopPage() {
  const { region } = useEngine();
  const w = regionWhere(region);
  const weekly = useSql<{ site_name: string; wk: string; p50_turnaround_h: number; status: string }>(
    `SELECT site_name, wk, p50_turnaround_h, status FROM mart_site_weekly${w} ORDER BY site_name, wk`);
  const backlog = useSql<{ site_name: string; age_lt_1d: number; age_1_3d: number; age_3_7d: number; age_7d_plus: number }>(
    `SELECT * FROM mart_backlog${w} ORDER BY backlog_days`);
  const rep = useSql<{ site_name: string; repeat_repair_pct: number; repeat_repairs: number }>(
    `SELECT * FROM mart_repeat_site${w} ORDER BY repeat_repair_pct`);
  const cats = useSql<{ issue_category: string; powertrain: string; jobs: number; avg_cost: number; repeat_repair_pct: number }>(
    `SELECT * FROM mart_issue_categories`);
  const parts = useSql<{ supplier: string; month_start: string; on_time_pct: number }>(
    `SELECT supplier, month_start, on_time_pct FROM mart_parts_eta ORDER BY month_start`);
  const open = useSql<{ part_order_id: string; site_name: string; supplier: string; part_description: string; days_overdue: number; is_overdue: boolean }>(
    `SELECT * FROM mart_parts_open${w} ORDER BY is_overdue DESC, days_overdue DESC NULLS LAST LIMIT 14`);
  const prod = useSql<{ site_name: string; month_start: string; productivity_pct: number }>(
    `SELECT site_name, month_start, productivity_pct FROM mart_productivity${w} ORDER BY month_start`);

  const rowsH = Math.max(300, (rep.data?.length ?? 12) * 26);

  return (
    <>
      <PageHeader eyebrow="Workshop clock" title="Key in to ready">
        Law 3: fix it once, or pay three times. Law 4: a parts ETA is a promise. INTERVENE flags a site whose weekly median
        turnaround runs far above the network and its own trend.
      </PageHeader>

      <Card title="Weekly turnaround by site" sub="Median hours, key in → ready; darker is slower. A dot marks an INTERVENE week (SOP-03).">
        {weekly.data ? (() => {
          const wks = [...new Set(weekly.data!.map((r) => r.wk))].sort();
          const sites = [...new Set(weekly.data!.map((r) => r.site_name))].sort();
          return <Chart height={Math.max(300, sites.length * 26 + 80)} option={(dark) => ({
            grid: { left: 8, right: 8, top: 8, bottom: 44, containLabel: true },
            tooltip: { formatter: (x: unknown) => {
              const d = (x as { value: [number, number, number, string] }).value;
              return `${sites[d[1]]} · ${wks[d[0]].slice(0, 10)}\n${d[2]} h · ${d[3]}`; } },
            xAxis: { type: "category", data: wks.map((x) => x.slice(0, 10)), axisLabel: { interval: 7 } },
            yAxis: { type: "category", data: sites },
            visualMap: { min: 10, max: 50, dimension: 2, orient: "horizontal", left: "center", bottom: 0, itemHeight: 160, itemWidth: 10,
              textStyle: { color: dark ? "#9097b0" : "#5b6178" },
              seriesIndex: 0, inRange: { color: dark ? ["#1a1e2e", "#2f3370", "#5b5fc7", "#a5b4fc"] : ["#f4f5fa", "#dfe3fb", "#a5b4fc", "#4f46e5"] } },
            series: [{ type: "heatmap", itemStyle: { borderColor: dark ? "#11141f" : "#fff", borderWidth: 1 },
              data: weekly.data!.map((r) => [wks.indexOf(r.wk), sites.indexOf(r.site_name), Number((r.p50_turnaround_h ?? 0).toFixed(1)), r.status]) },
              // INTERVENE weeks: a small dark dot in the cell, readable on any heat colour
              { type: "scatter", symbolSize: 5, silent: true, z: 3, itemStyle: { color: dark ? "#ffffff" : "#0f1222" },
                data: weekly.data!.filter((r) => r.status === "INTERVENE").map((r) => [wks.indexOf(r.wk), sites.indexOf(r.site_name)]) }],
          })} />;
        })() : <Skeleton height={380} />}
      </Card>

      <SectionTitle sub="Comebacks on the same fault within the repeat window; each one runs every clock twice.">Fix it once</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Repeat repairs by site" sub="Last quarter; red above 8%, dashed line is the 5% target">
          {rep.data ? <Chart height={rowsH} option={(dark) => ({
            grid: { left: 8, right: 120, top: 8, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis", axisPointer: { type: "none" } },
            xAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
            yAxis: { type: "category", data: rep.data!.map((r) => r.site_name) },
            series: [{ type: "bar", barWidth: "60%",
              label: { show: true, position: "right", fontSize: 11, color: dark ? "#9097b0" : "#5b6178", textBorderWidth: 0,
                formatter: (x: { dataIndex: number; value: unknown }) => `${x.value}% · ${rep.data![x.dataIndex].repeat_repairs} comebacks` },
              data: rep.data!.map((r) => ({ value: Number((r.repeat_repair_pct ?? 0).toFixed(1)),
                itemStyle: { borderRadius: [0, 3, 3, 0], color: r.repeat_repair_pct > 8 ? STATUS.bad : dark ? "#818cf8" : "#6366f1" } })),
              markLine: { silent: true, symbol: "none", data: [{ xAxis: 5 }], label: { formatter: "5%", position: "end", fontSize: 10.5, color: dark ? "#9097b0" : "#5b6178" },
                lineStyle: { type: "dashed", width: 1, color: dark ? "#5d6480" : "#9aa0b4" } } }],
          })} /> : <Skeleton />}
        </Card>
        <Card title="Common repair & issue categories" sub="Jobs by category, with the repeat-repair rate; red above 8%">
          {cats.data ? <Chart height={rowsH} option={(dark) => {
            const agg = [...new Set(cats.data!.map((c) => c.issue_category))].map((c) => {
              const xs = cats.data!.filter((x) => x.issue_category === c), jobs = xs.reduce((n, x) => n + x.jobs, 0);
              const rr = jobs ? xs.reduce((n, x) => n + (x.repeat_repair_pct ?? 0) * x.jobs, 0) / jobs : 0;
              return { c, jobs, rr };
            }).sort((a, b) => a.jobs - b.jobs);
            return {
              grid: { left: 4, right: 110, top: 4, bottom: 4, containLabel: true },
              tooltip: { trigger: "item", formatter: (x: unknown) => { const a = agg[(x as { dataIndex: number }).dataIndex];
                return `${a.c}\n${a.jobs.toLocaleString()} jobs · repeat ${a.rr.toFixed(1)}%`; } },
              xAxis: { type: "value", splitNumber: 3 },
              yAxis: { type: "category", data: agg.map((a) => a.c), axisLine: { show: false } },
              series: [{ type: "bar", barWidth: 12, data: agg.map((a) => ({ value: a.jobs,
                itemStyle: { borderRadius: [0, 3, 3, 0], color: a.rr > 8 ? STATUS.bad : dark ? "#818cf8" : "#6366f1" } })),
                label: { show: true, position: "right", fontSize: 10.5, color: dark ? "#9097b0" : "#5b6178",
                  formatter: (x: unknown) => { const a = agg[(x as { dataIndex: number }).dataIndex]; return `${a.jobs.toLocaleString()} · ${a.rr.toFixed(1)}% repeat`; } } }],
            };
          }} /> : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Promises kept by supplier, and every open order against its promised ETA.">Parts: a promise is a promise</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="On-time arrival by supplier">
          {parts.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` }, legend: {},
            xAxis: { type: "category", data: monthLabels(parts.data!) },
            yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            series: linesBy(parts.data!, (r) => r.supplier, (r) => r.on_time_pct, 1.75).map((s, i) => ({ ...s, lineStyle: { width: 1.75, color: PALETTE[i] } })),
          })} /> : <Skeleton />}
        </Card>
        <Card title="Open orders, overdue first">
          {open.data ? (
            <div className="max-h-[300px] overflow-auto text-[12.5px]">
              <table className="tnum w-full">
                <thead className="sticky top-0 bg-panel text-left text-faint">
                  <tr><th className="py-1 font-medium">Order</th><th className="font-medium">Site</th><th className="font-medium">Supplier</th><th className="text-right font-medium">Days late</th></tr>
                </thead>
                <tbody>{open.data.map((o) => (
                  <tr key={o.part_order_id} className="border-t border-border">
                    <td className="py-1.5">{o.part_order_id}<div className="text-[11px] text-faint">{o.part_description}</div></td>
                    <td>{o.site_name}</td>
                    <td>{o.supplier}</td>
                    <td className="text-right font-medium" style={{ color: o.is_overdue ? "var(--bad)" : "var(--muted)" }}>
                      {o.is_overdue ? o.days_overdue?.toFixed(1) : "on track"}
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ) : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Billed ÷ available technician hours; target 80%.">Backlog and productivity</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Open jobs by age" sub="Sorted by days of backlog">
          {backlog.data ? <Chart height={Math.max(300, backlog.data.length * 26)} option={() => ({
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: {},
            xAxis: { type: "value" }, yAxis: { type: "category", data: backlog.data!.map((b) => b.site_name) },
            series: ([["age_lt_1d", "< 1 day", RISK_SCALE[0]], ["age_1_3d", "1-3 days", RISK_SCALE[1]], ["age_3_7d", "3-7 days", RISK_SCALE[2]],
              ["age_7d_plus", "7+ days", RISK_SCALE[3]]] as const).map(([k, n, c]) => ({
              name: n, type: "bar" as const, stack: "b", itemStyle: { color: c }, data: backlog.data!.map((b) => b[k]) })),
          })} /> : <Skeleton />}
        </Card>
        <Card title="Technician productivity by site" sub="Grey: each site (hover to see it); purple: median site; dashed: 80% target">
          {prod.data ? <Chart height={Math.max(300, (backlog.data?.length ?? 12) * 26)} option={(dark) => {
            const ctx = contextLines(prod.data!, (r) => r.site_name, (r) => r.productivity_pct, "Median site", dark, { value: 80, label: "target 80%" });
            return {
              tooltip: { trigger: "item", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
              xAxis: { type: "category", data: monthLabels(prod.data!) },
              yAxis: { type: "value", scale: true, axisLabel: { formatter: "{value}%" } },
              ...ctx,
            };
          }} /> : <Skeleton />}
        </Card>
      </div>
    </>
  );
}

