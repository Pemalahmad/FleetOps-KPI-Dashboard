"use client";

import { Chart, PALETTE } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { months } from "@/lib/chart-helpers";

const STATUS_COLOR: Record<string, string> = { Valid: "#10B981", Expiring: "#F59E0B", Expired: "#F43F5E", Unknown: "#94A3B8" };

export default function LicencePage() {
  const { region } = useEngine();
  const w = regionWhere(region);
  const status = useSql<{ document: string; status: string; vehicles: number }>(
    `SELECT document, status, sum(vehicles)::INT AS vehicles FROM mart_compliance_status${w} GROUP BY 1, 2`);
  const cal = useSql<{ document: string; wk: string; vehicles: number }>(`SELECT document, wk, vehicles FROM mart_compliance_calendar ORDER BY wk`);
  const expiring = useSql<{ vehicle_id: string; region: string; document: string; status: string; days_left: number }>(`
    SELECT vehicle_id, region, document, status, days_left FROM mart_compliance_expiring${w} ORDER BY days_left LIMIT 14`);
  const fines = useSql<{ month_start: string; fine_type: string; fines: number }>(
    `SELECT month_start, fine_type, sum(fines)::INT AS fines FROM mart_fines_monthly${w} GROUP BY 1, 2 ORDER BY 1`);
  const offenders = useSql<{ vehicle_id: string; region: string; fines: number; amount: number; unpaid_amount: number }>(
    `SELECT vehicle_id, region, fines, amount, unpaid_amount FROM mart_fines_vehicle${w} ORDER BY fines DESC, amount DESC LIMIT 12`);
  const pm = useSql<{ powertrain: string; vehicles: number; overdue: number; due_soon: number }>(
    `SELECT powertrain, sum(vehicles)::INT vehicles, sum(overdue)::INT overdue, sum(due_soon)::INT due_soon FROM mart_pm_compliance${w} GROUP BY 1 ORDER BY 1`);
  const recall = useSql<{ campaign_id: string; region: string; week_no: number; cumulative_completion_pct: number }>(
    `SELECT * FROM mart_recall_curve${w} ORDER BY week_no`);

  return (
    <>
      <PageHeader eyebrow="The licence" title="A gate, not a score">
        Law 6: registration, insurance, preventive maintenance and recalls are not traded against speed or cost. An expired vehicle is
        grounded until it is renewed (SOP-07).
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Registration and insurance status" sub="Active vehicles">
          {status.data ? <Chart height={220} option={() => {
            const docs = ["Registration", "Insurance"];
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: {},
              grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
              xAxis: { type: "value" }, yAxis: { type: "category", data: docs },
              series: ["Valid", "Expiring", "Expired", "Unknown"].map((s) => ({
                name: s, type: "bar" as const, stack: "s", barWidth: "50%", itemStyle: { color: STATUS_COLOR[s] },
                data: docs.map((d) => status.data!.find((r) => r.document === d && r.status === s)?.vehicles ?? 0) })),
            };
          }} /> : <Skeleton height={220} />}
        </Card>
        <Card title="Renewals due by week" sub="Book capacity for inspections before the wave hits">
          {cal.data ? <Chart height={220} option={() => {
            const wks = [...new Set(cal.data!.map((r) => r.wk))].sort();
            return {
              tooltip: { trigger: "axis" }, legend: {}, grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
              xAxis: { type: "category", data: wks.map((x) => x.slice(5, 10)) }, yAxis: { type: "value" },
              series: ["Registration", "Insurance"].map((d, i) => ({ name: d, type: "bar" as const, stack: "c", itemStyle: { color: PALETTE[i] },
                data: wks.map((k) => cal.data!.find((r) => r.wk === k && r.document === d)?.vehicles ?? 0) })),
            };
          }} /> : <Skeleton height={220} />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card title="Expired or expiring next" sub="Ground the expired ones today">
          {expiring.data ? (
            <table className="tnum w-full text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Region</th><th className="font-medium">Document</th><th className="text-right font-medium">Days left</th></tr></thead>
              <tbody>{expiring.data.map((e) => (
                <tr key={`${e.vehicle_id}${e.document}`} className="border-t border-border">
                  <td className="py-1.5">{e.vehicle_id}</td><td>{e.region}</td><td>{e.document}</td>
                  <td className="text-right font-medium" style={{ color: STATUS_COLOR[e.status] ?? "inherit" }}>{e.days_left}</td>
                </tr>))}
              </tbody>
            </table>
          ) : <Skeleton />}
        </Card>
        <Card title="Preventive maintenance" sub="Inside the km-or-months interval for each powertrain">
          {pm.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: {},
            xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            yAxis: { type: "category", data: pm.data!.map((r) => r.powertrain) },
            series: ([["On schedule", "#10B981", (r: NonNullable<typeof pm.data>[number]) => r.vehicles - r.overdue - r.due_soon],
              ["Due soon", "#F59E0B", (r: NonNullable<typeof pm.data>[number]) => r.due_soon],
              ["Overdue", "#F43F5E", (r: NonNullable<typeof pm.data>[number]) => r.overdue]] as const).map(([n, c, f]) => ({
              name: n, type: "bar" as const, stack: "p", barWidth: "55%", itemStyle: { color: c },
              data: pm.data!.map((r) => Number(((100 * f(r)) / r.vehicles).toFixed(1))) })),
          })} /> : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Every fine is a licence event: pay or dispute before the penalty date, and brief repeat offenders.">Fines</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Fines registered per month, by type">
          {fines.data ? <Chart height={320} option={() => {
            const ms = months(fines.data!);
            const types = [...new Set(fines.data!.map((r) => r.fine_type))];
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: { type: "scroll" },
              xAxis: { type: "category", data: ms.map((m) => m.slice(0, 7)) }, yAxis: { type: "value" },
              series: types.map((t, i) => ({ name: t, type: "bar" as const, stack: "f", itemStyle: { color: PALETTE[i] },
                data: ms.map((m) => fines.data!.find((r) => r.month_start === m && r.fine_type === t)?.fines ?? 0) })),
            };
          }} /> : <Skeleton height={320} />}
        </Card>
        <Card title="Repeat offenders">
          {offenders.data ? (
            <table className="tnum w-full text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Region</th><th className="text-right font-medium">Fines</th><th className="text-right font-medium">Unpaid</th></tr></thead>
              <tbody>{offenders.data.map((o) => (
                <tr key={o.vehicle_id} className="border-t border-border">
                  <td className="py-1.5">{o.vehicle_id}</td><td>{o.region}</td><td className="text-right font-medium">{o.fines}</td>
                  <td className="text-right" style={{ color: o.unpaid_amount > 0 ? "var(--bad)" : "var(--muted)" }}>${Math.round(o.unpaid_amount).toLocaleString()}</td>
                </tr>))}
              </tbody>
            </table>
          ) : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Cumulative completion by week since launch, per campaign and region.">Recalls</SectionTitle>
      <Card>
        {recall.data ? <Chart height={300} option={() => {
          const keys = [...new Set(recall.data!.map((r) => `${r.campaign_id} · ${r.region}`))].sort();
          return {
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` }, legend: { type: "scroll" },
            xAxis: { type: "value", name: "weeks since launch", nameLocation: "middle", nameGap: 26 },
            yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            series: keys.map((k) => ({ name: k, type: "line" as const, smooth: true, symbol: "none", lineStyle: { width: 1.8 },
              data: recall.data!.filter((r) => `${r.campaign_id} · ${r.region}` === k).map((r) => [r.week_no, r.cumulative_completion_pct]) })),
          };
        }} /> : <Skeleton />}
      </Card>
    </>
  );
}
