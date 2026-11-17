"use client";

import { Chart, PALETTE } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { linesBy, monthLabels, months } from "@/lib/chart-helpers";

export default function CustomerPage() {
  const { region } = useEngine();
  const w = regionWhere(region);
  const clocks = useSql<{ region: string; workshop: number; pickup: number; back: number }>(`
    SELECT region, workshop_p50_h AS workshop, time_to_pickup_p50_h AS pickup, back_to_ops_p50_h AS back
    FROM mart_handover_monthly WHERE month_start = report_month()${regionWhere(region, "AND")} ORDER BY off_road_p50_h`);
  const cust = useSql<{ region: string; month_start: string; csat_pct: number }>(`SELECT region, month_start, csat_pct FROM mart_customer_monthly${w} ORDER BY month_start`);
  const k2k = useSql<{ month_start: string; p50: number; p90: number }>(`
    SELECT month_start, avg(key_to_key_p50_h) AS p50, avg(key_to_key_p90_h) AS p90 FROM mart_key_to_key_monthly${w} GROUP BY 1 ORDER BY 1`);
  const dist = useSql<{ rating: number; responses: number }>(`SELECT rating, sum(responses)::INT AS responses FROM mart_rating_distribution${w} GROUP BY 1 ORDER BY 1`);
  const sites = useSql<{ site_name: string; csat_pct: number }>(`SELECT site_name, csat_pct FROM mart_customer_site${w} ORDER BY csat_pct`);
  const kd = useSql<{ job_type: string; bucket: string; bucket_order: number; jobs: number }>(`SELECT * FROM mart_key_to_key_distribution ORDER BY bucket_order`);

  return (
    <>
      <PageHeader eyebrow="Customer clock" title="The hours the customer counts">
        Law 1: the job card is the workshop&apos;s story; key-to-key is the customer&apos;s. Law 2: a vehicle is not fixed until it is earning,
        so the fleet clock adds the time from key back to earning again.
      </PageHeader>

      <Card title="The three clocks, median hours per visit"
        sub="Workshop (key in → ready) + pick-up (ready → key back) = customer clock; + back to operations = fleet clock">
        {clocks.data ? (
          <Chart height={Math.max(220, clocks.data.length * 44 + 60)} option={() => ({
            grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${Number(v).toFixed(1)} h` },
            legend: { data: ["Workshop", "Pick-up", "Back to operations"] },
            xAxis: { type: "value", axisLabel: { formatter: "{value} h" } },
            yAxis: { type: "category", data: clocks.data!.map((r) => r.region) },
            series: (["workshop", "pickup", "back"] as const).map((k, i) => ({
              name: ["Workshop", "Pick-up", "Back to operations"][i], type: "bar" as const, stack: "c", barWidth: "58%",
              itemStyle: { color: ["#6366F1", "#06B6D4", "#F59E0B"][i], borderRadius: i === 2 ? [0, 6, 6, 0] : 0 },
              label: { show: true, color: "#fff", textBorderWidth: 0, fontSize: 11, formatter: (x: { value: unknown }) => Number(x.value).toFixed(1) },
              data: clocks.data!.map((r) => Number(r[k]?.toFixed(2))),
            })),
          })} />
        ) : <Skeleton />}
      </Card>

      <SectionTitle>Satisfaction</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="CSAT by region" sub="Share of 4-5★" className="lg:col-span-2">
          {cust.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
            legend: { type: "scroll" }, xAxis: { type: "category", data: monthLabels(cust.data!) },
            yAxis: { type: "value", scale: true, axisLabel: { formatter: "{value}%" } },
            series: linesBy(cust.data!, (r) => r.region, (r) => r.csat_pct),
          })} /> : <Skeleton />}
        </Card>
        <Card title="Rating distribution" sub="All responses in the window">
          {dist.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "item" },
            series: [{ type: "pie", radius: ["52%", "78%"], padAngle: 2, itemStyle: { borderRadius: 6 },
              label: { formatter: "{b}★ {d}%", fontSize: 11 },
              data: dist.data!.map((d) => ({ name: String(d.rating), value: d.responses,
                itemStyle: { color: ["#F43F5E", "#FB923C", "#FBBF24", "#34D399", "#10B981"][d.rating - 1] } })) }],
          })} /> : <Skeleton />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Key-to-key, median and p90" sub="The tail is what customers remember">
          {k2k.data ? <Chart height={300} option={() => ({
            tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)} h` }, legend: { data: ["p50", "p90"] },
            xAxis: { type: "category", data: months(k2k.data!).map((m) => m.slice(0, 7)) },
            yAxis: { type: "value", axisLabel: { formatter: "{value} h" } },
            series: [
              { name: "p90", type: "line", smooth: true, symbol: "none", data: k2k.data!.map((r) => r.p90),
                lineStyle: { color: "#F59E0B", width: 2 }, areaStyle: { color: "rgba(245,158,11,.10)" } },
              { name: "p50", type: "line", smooth: true, symbol: "none", data: k2k.data!.map((r) => r.p50),
                lineStyle: { color: "#6366F1", width: 2.5 }, areaStyle: { color: "rgba(99,102,241,.14)" } }],
          })} /> : <Skeleton />}
        </Card>
        <Card title="Key-to-key by job type" sub="Jobs per duration bucket">
          {kd.data ? <Chart height={300} option={() => {
            const buckets = [...new Map(kd.data!.map((r) => [r.bucket, r.bucket_order])).entries()].sort((a, b) => a[1] - b[1]).map((b) => b[0]);
            const types = [...new Set(kd.data!.map((r) => r.job_type))];
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: { type: "scroll" },
              xAxis: { type: "category", data: buckets }, yAxis: { type: "value" },
              series: types.map((t, i) => ({ name: t, type: "bar" as const, stack: "j", itemStyle: { color: PALETTE[i] },
                data: buckets.map((b) => kd.data!.find((r) => r.job_type === t && r.bucket === b)?.jobs ?? 0) })),
            };
          }} /> : <Skeleton />}
        </Card>
      </div>

      <SectionTitle sub="Lowest CSAT first; each 1-2★ rating opens SOP-08.">Sites</SectionTitle>
      <Card>
        {sites.data ? <Chart height={Math.max(260, sites.data.length * 28)} option={(dark) => ({
          grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
          tooltip: { trigger: "axis", axisPointer: { type: "none" }, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
          xAxis: { type: "value", min: (v: { min: number }) => Math.floor(v.min - 3), axisLabel: { formatter: "{value}%" } },
          yAxis: { type: "category", data: sites.data!.map((s) => s.site_name) },
          series: [{ type: "bar", barWidth: "60%", label: { show: true, position: "right", formatter: "{c}%", fontSize: 11, color: dark ? "#9097b0" : "#5b6178", textBorderWidth: 0 },
            data: sites.data!.map((s) => ({ value: Number(s.csat_pct.toFixed(1)),
              itemStyle: { borderRadius: [0, 6, 6, 0], color: s.csat_pct >= 85 ? "#10B981" : s.csat_pct >= 75 ? "#F59E0B" : "#F43F5E" } })) }],
        })} /> : <Skeleton />}
      </Card>
    </>
  );
}
