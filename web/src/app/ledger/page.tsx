"use client";

import { Chart, PALETTE } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { linesBy, monthLabels, months } from "@/lib/chart-helpers";

const PT = ["BEV", "PHEV", "HEV", "ICE"];

export default function LedgerPage() {
  const { region } = useEngine();
  const w = regionWhere(region);
  const box = useSql<{ powertrain: string; q0: number; q1: number; q2: number; q3: number; q4: number; vehicles: number; total: number }>(`
    SELECT powertrain, quantile_cont(spend_per_1000_km, 0.05) q0, quantile_cont(spend_per_1000_km, 0.25) q1,
           quantile_cont(spend_per_1000_km, 0.5) q2, quantile_cont(spend_per_1000_km, 0.75) q3,
           quantile_cont(spend_per_1000_km, 0.95) q4, count(*) AS vehicles, sum(total_service_spend) AS total
    FROM mart_vehicle_service_spend WHERE spend_per_1000_km IS NOT NULL${regionWhere(region, "AND")} GROUP BY 1`);
  const top = useSql<{ vehicle_id: string; powertrain: string; region: string; visits: number; total_service_spend: number; goodwill: number }>(`
    SELECT vehicle_id, powertrain, region, visits, total_service_spend, goodwill FROM mart_vehicle_service_spend${w}
    ORDER BY total_service_spend DESC LIMIT 12`);
  const gw = useSql<{ month_start: string; goodwill: number; spend: number }>(`
    SELECT month_start, sum(goodwill_amount) AS goodwill, sum(service_spend) AS spend FROM mart_goodwill_monthly${w} GROUP BY 1 ORDER BY 1`);
  const cost = useSql<{ region: string; month_start: string; cost_vs_budget_pct: number }>(`SELECT region, month_start, cost_vs_budget_pct FROM mart_cost_monthly${w} ORDER BY month_start`);
  const tco = useSql<{ powertrain: string; energy_cost_per_km: number; maintenance_cost_per_km: number; depreciation_per_km: number; co2_g_per_km: number }>(
    `SELECT * FROM mart_powertrain_kpis`);
  const value = useSql<{ month_start: string; powertrain: string; value_retained_pct: number }>(`SELECT month_start, powertrain, value_retained_pct FROM mart_asset_value_monthly ORDER BY month_start`);

  return (
    <>
      <PageHeader eyebrow="The ledger" title="What each vehicle costs, and who pays">
        Service spend per vehicle, goodwill (the price of broken laws), cost against budget, and the cost per km of each powertrain:
        energy, maintenance and depreciation.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Service spend per 1,000 km" sub="Per vehicle, by powertrain: box = middle half, whiskers = 5th to 95th percentile">
          {box.data ? <Chart height={320} option={() => {
            const rows = PT.map((p) => box.data!.find((b) => b.powertrain === p)).filter(Boolean) as NonNullable<typeof box.data>;
            return {
              tooltip: { trigger: "item", formatter: (x: unknown) => {
                const d = (x as { dataIndex: number }).dataIndex; const r = rows[d];
                return `${r.powertrain} · ${r.vehicles.toLocaleString()} vehicles<br/>median $${r.q2.toFixed(0)} / 1,000 km<br/>total $${(r.total / 1e6).toFixed(2)} M`; } },
              xAxis: { type: "category", data: rows.map((r) => r.powertrain) },
              yAxis: { type: "value", axisLabel: { formatter: "${value}" } },
              series: [{ type: "boxplot", itemStyle: { borderWidth: 2 },
                data: rows.map((r, i) => ({ value: [r.q0, r.q1, r.q2, r.q3, r.q4].map((v) => Number(v.toFixed(1))),
                  itemStyle: { color: `${PALETTE[i]}33`, borderColor: PALETTE[i] } })) }],
            };
          }} /> : <Skeleton height={320} />}
        </Card>
        <Card title="Highest-spend vehicles">
          {top.data ? (
            <table className="tnum w-full text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Type</th><th className="font-medium">Region</th><th className="text-right font-medium">Visits</th><th className="text-right font-medium">Spend</th></tr></thead>
              <tbody>{top.data.map((v) => (
                <tr key={v.vehicle_id} className="border-t border-border">
                  <td className="py-1.5">{v.vehicle_id}</td><td>{v.powertrain}</td><td>{v.region}</td>
                  <td className="text-right">{v.visits}</td><td className="text-right font-medium">${Math.round(v.total_service_spend).toLocaleString()}</td>
                </tr>))}
              </tbody>
            </table>
          ) : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Goodwill is paid when a law was broken: a comeback, a missed key-back promise, a late part (SOP-08).">Goodwill</SectionTitle>
      <Card>
        {gw.data ? <Chart height={300} option={(dark) => ({
          tooltip: { trigger: "axis" }, legend: {},
          xAxis: { type: "category", data: months(gw.data!).map((m) => m.slice(0, 7)) },
          yAxis: [{ type: "value", axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
            { type: "value", axisLabel: { formatter: "{value}%" }, splitLine: { show: false } }],
          series: [
            { name: "Goodwill paid", type: "bar", barWidth: "55%", itemStyle: { color: dark ? "rgba(245,158,11,.55)" : "rgba(245,158,11,.7)", borderRadius: [5, 5, 0, 0] },
              data: gw.data!.map((r) => Math.round(r.goodwill)) },
            { name: "% of service spend", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: "#6366F1" }, itemStyle: { color: "#6366F1" },
              data: gw.data!.map((r) => Number(((100 * r.goodwill) / r.spend).toFixed(2))) }],
        })} /> : <Skeleton />}
      </Card>

      <SectionTitle>Budget and powertrain economics</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cost vs budget by region" sub="Fleet-paid maintenance, % over (+) or under (−) budget">
          {cost.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` }, legend: { type: "scroll" },
            xAxis: { type: "category", data: monthLabels(cost.data!) },
            yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
            series: linesBy(cost.data!, (r) => r.region, (r) => r.cost_vs_budget_pct),
          })} /> : <Skeleton />}
        </Card>
        <Card title="Cost per km by powertrain" sub="Energy + maintenance + depreciation">
          {tco.data ? <Chart height={300} option={() => {
            const rows = PT.map((p) => tco.data!.find((t) => t.powertrain === p)).filter(Boolean) as NonNullable<typeof tco.data>;
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `$${Number(v).toFixed(3)}` }, legend: {},
              xAxis: { type: "category", data: rows.map((r) => r.powertrain) },
              yAxis: { type: "value", axisLabel: { formatter: (v: number) => `$${v.toFixed(2)}` } },
              series: ([["energy_cost_per_km", "Energy", "#06B6D4"], ["maintenance_cost_per_km", "Maintenance", "#6366F1"],
                ["depreciation_per_km", "Depreciation", "#94A3B8"]] as const).map(([k, n, c], i) => ({
                name: n, type: "bar" as const, stack: "t", barWidth: "45%", itemStyle: { color: c, borderRadius: i === 2 ? [5, 5, 0, 0] : 0 },
                data: rows.map((r) => r[k]) })),
            };
          }} /> : <Skeleton />}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Value retained by powertrain" sub="Book value ÷ acquisition cost">
          {value.data ? <Chart height={280} option={() => ({
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` }, legend: {},
            xAxis: { type: "category", data: monthLabels(value.data!) },
            yAxis: { type: "value", scale: true, axisLabel: { formatter: "{value}%" } },
            series: linesBy(value.data!, (r) => r.powertrain, (r) => r.value_retained_pct, 2.5),
          })} /> : <Skeleton />}
        </Card>
      </div>
    </>
  );
}
