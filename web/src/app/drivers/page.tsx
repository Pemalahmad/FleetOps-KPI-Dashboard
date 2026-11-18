"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MagnifyingGlass, Warning, WarningCircle, Info } from "@phosphor-icons/react";
import { Chart, PALETTE, STATUS } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { attention, Card, PageHeader, SectionTitle, Skeleton, StatStrip, type Rag } from "@/components/ui";

interface DriverRow {
  driver_id: string; driver_name: string; region: string | null; site_name: string | null; plate: string | null; vehicle_id: string | null;
  licence_class: string | null; licence_expiry: string | null; licence_status: string; licence_days_left: number | null; is_active: boolean;
  km: number; trips: number; idle_pct: number | null; speeding_per_100km: number | null; harsh_per_100km: number | null;
  geofence_exits: number; safety_score: number | null; top_speed: number | null;
}
interface AlertRow {
  rule: string; rule_label: string; subject_type: string; subject_id: string; vehicle_id: string | null; region: string | null;
  value: number; threshold: number; unit: string; severity: string; name: string | null; plate: string | null;
}

const SEV: Record<string, { color: string; icon: React.ReactNode; rank: number }> = {
  critical: { color: "var(--bad)", icon: <Warning size={15} weight="fill" />, rank: 0 },
  warning: { color: "var(--warn)", icon: <WarningCircle size={15} weight="fill" />, rank: 1 },
  info: { color: "var(--muted)", icon: <Info size={15} weight="fill" />, rank: 2 },
};
const band = (s: number | null) => (s === null ? null : s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : "D");
const PAGE = 30;

export default function DriversPage() {
  const { region, status } = useEngine();
  const drivers = useSql<DriverRow>(`SELECT d.*, s.site_name, v.plate_number AS plate FROM mart_driver_scores d
    LEFT JOIN stg_sites s ON s.site_id = d.home_site_id LEFT JOIN stg_vehicles v ON v.vehicle_id = d.vehicle_id${regionWhere(region, "WHERE", "d.region")}`);
  const alerts = useSql<AlertRow>(`SELECT a.*, d.driver_name AS name, v.plate_number AS plate FROM mart_alerts a
    LEFT JOIN stg_drivers d ON a.subject_type = 'driver' AND d.driver_id = a.subject_id
    LEFT JOIN stg_vehicles v ON v.vehicle_id = a.vehicle_id${regionWhere(region, "WHERE", "a.region")}`);
  const limits = useSql<{ key: string; value: string }>("SELECT key, value FROM cfg_settings WHERE key LIKE 'alert_%'");
  const lim = Object.fromEntries((limits.data ?? []).map((r) => [r.key, Number(r.value)]));
  const rows = useMemo(() => drivers.data ?? [], [drivers.data]);
  const driven = rows.filter((r) => r.km > 0);
  const hasTrips = driven.length > 0;

  const k = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    const km = driven.reduce((n, r) => n + r.km, 0);
    const wavg = (f: (r: DriverRow) => number | null) => km ? driven.reduce((n, r) => n + (f(r) ?? 0) * r.km, 0) / km : null;
    return {
      drivers: active.length, scored: driven.length,
      score: driven.length ? driven.reduce((n, r) => n + (r.safety_score ?? 0), 0) / driven.length : null,
      low: driven.filter((r) => (r.safety_score ?? 100) < 70).length,
      expired: active.filter((r) => r.licence_status === "Expired").length,
      expiring: active.filter((r) => r.licence_status === "Expiring").length,
      speeding: wavg((r) => r.speeding_per_100km), harsh: wavg((r) => r.harsh_per_100km), idle: wavg((r) => r.idle_pct),
    };
  }, [rows, driven]);

  const [rule, setRule] = useState<string | null>(null), [q, setQ] = useState(""), [page, setPage] = useState(0);
  const ruleCounts = useMemo(() => {
    const m = new Map<string, { label: string; n: number; sev: string }>();
    for (const a of alerts.data ?? []) { const e = m.get(a.rule) ?? { label: a.rule_label, n: 0, sev: a.severity }; e.n++; m.set(a.rule, e); }
    return [...m.entries()].sort((a, b) => SEV[a[1].sev].rank - SEV[b[1].sev].rank || b[1].n - a[1].n);
  }, [alerts.data]);
  const shownAlerts = useMemo(() => (alerts.data ?? []).filter((a) => !rule || a.rule === rule)
    .sort((a, b) => SEV[a.severity].rank - SEV[b.severity].rank || b.value / (b.threshold || 1) - a.value / (a.threshold || 1)), [alerts.data, rule]);
  const register = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || [r.driver_id, r.driver_name, r.plate, r.vehicle_id, r.site_name].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => (a.safety_score ?? 101) - (b.safety_score ?? 101));
  }, [rows, q]);

  const rag = (v: number | null, limit: number | undefined): Rag => (v === null || !limit ? null : v > limit ? "red" : v > limit * 0.75 ? "amber" : null);

  return (
    <>
      <PageHeader eyebrow="Drivers & trips" title="Every driver, scored on the road">
        Drivers and their licences, and how each one drives: speeding, harsh driving, idling and leaving the permitted zone, read
        from your telematics exports (Geotab, Webfleet, Samsara, Motive…) and checked against the limits in your settings.
      </PageHeader>

      {drivers.data && !rows.length && (
        <Card className="mb-4">
          <p className="text-[13.5px] text-muted"><b className="text-text">No drivers loaded yet.</b> Add a drivers sheet (id, name, licence class and expiry,
            assigned vehicle) and a trips export (vehicle, start, km, idle minutes, speeding and harsh events) on the{" "}
            <Link href="/import/" className="text-accent hover:underline">import page</Link>. Both are optional; everything else keeps working without them.</p>
        </Card>
      )}

      <StatStrip items={[
        { label: "Active drivers", value: k.drivers, note: `${k.scored.toLocaleString()} with trips` },
        { label: "Average safety score", value: k.score, decimals: 0, status: k.score === null ? null : k.score >= 85 ? "green" : k.score >= 70 ? "amber" : "red", note: "0-100" },
        { label: "Below 70", value: k.low, status: k.low ? "amber" : "green", note: "Drivers to coach" },
        { label: "Licences expired", value: k.expired, status: k.expired ? "red" : "green" },
        { label: "Expiring in 30 days", value: k.expiring, status: k.expiring ? "amber" : "green" },
        { label: "Speeding", value: k.speeding, unit: "/100 km", decimals: 2 },
        { label: "Harsh driving", value: k.harsh, unit: "/100 km", decimals: 2 },
        { label: "Idle time", value: k.idle, unit: "%", decimals: 1 },
      ]} />

      <SectionTitle sub={`Rules run on every build: speeding over ${lim.alert_speeding_per_100km ?? "–"} and harsh driving over ${lim.alert_harsh_per_100km ?? "–"} events per 100 km, idling over ${lim.alert_idle_pct ?? "–"}% of engine-on time, any exit from the permitted zone, and licences expired or expiring. The limits live in the alerts section of fleet.yml.`}>Alert rules</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button className={"ops-chip " + (!rule ? "ops-chip-active" : "")} onClick={() => setRule(null)}>All alerts<span className="tnum ml-1.5 text-faint">{(alerts.data?.length ?? 0).toLocaleString()}</span></button>
        {ruleCounts.map(([id, r]) => (
          <button key={id} className={"ops-chip " + (rule === id ? "ops-chip-active" : "")} onClick={() => setRule(id)}>
            <span className="mr-1.5" style={{ color: SEV[r.sev].color }}>{SEV[r.sev].icon}</span>{r.label}<span className="tnum ml-1.5 text-faint">{r.n.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <Card className="!p-0">
        {alerts.data ? (
          shownAlerts.length ? (
            <ul className="divide-y divide-border">
              {shownAlerts.slice(0, 12).map((a) => (
                <li key={a.rule + a.subject_id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span style={{ color: SEV[a.severity].color }}>{SEV[a.severity].icon}</span>
                  <span className="min-w-0">
                    <b className="font-semibold">{a.rule_label}</b>
                    <span className="text-muted"> · {a.subject_type === "driver" ? `${a.name ?? a.subject_id}${a.plate ? ` (${a.plate})` : ""}` : a.plate ?? a.subject_id}</span>
                    <span className="text-faint"> · {a.region ?? "–"}</span>
                  </span>
                  <span className="tnum text-right text-[12.5px]">
                    <b style={{ color: SEV[a.severity].color }}>{Number(a.value).toLocaleString("en", { maximumFractionDigits: 2 })}</b>
                    <span className="text-muted"> {a.unit}</span>
                    {a.rule.startsWith("licence") ? null : <span className="text-faint"> · limit {a.threshold}</span>}
                  </span>
                </li>
              ))}
              {shownAlerts.length > 12 && <li className="px-4 py-2.5 text-[12px] text-muted">and {(shownAlerts.length - 12).toLocaleString()} more; the register below is sorted by score.</li>}
            </ul>
          ) : <p className="p-5 text-[13px] text-muted">No alerts in the window. Every driver and vehicle is inside the limits.</p>
        ) : <div className="p-4"><Skeleton height={240} /></div>}
      </Card>

      {hasTrips && (
        <>
          <SectionTitle sub="Safety score from speeding, harsh driving, idling and zone exits against the limits. A is 85 or more, D below 55.">Score bands</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Drivers by band">
              <Chart height={220} option={(dark) => {
                const bands = ["A", "B", "C", "D"], n = bands.map((b) => driven.filter((r) => band(r.safety_score) === b).length);
                return {
                  grid: { left: 4, right: 60, top: 4, bottom: 4, containLabel: true }, tooltip: { trigger: "item" },
                  xAxis: { type: "value", show: false }, yAxis: { type: "category", data: bands.map((b) => `Band ${b}`).reverse(), axisLine: { show: false } },
                  series: [{ type: "bar", barWidth: 14, label: { show: true, position: "right", color: dark ? "#9097b0" : "#5b6178", fontSize: 11 },
                    data: n.map((v, i) => ({ value: v, itemStyle: { borderRadius: [0, 3, 3, 0], color: [PALETTE[0], PALETTE[2], STATUS.warn, STATUS.bad][i] } })).reverse() }],
                };
              }} />
            </Card>
            <Card title="Speeding against harsh driving" sub="Each dot is a driver; the dashed lines are the alert limits">
              <Chart height={220} option={(dark) => ({
                grid: { left: 4, right: 16, top: 12, bottom: 4, containLabel: true },
                tooltip: { trigger: "item", formatter: (x: unknown) => { const r = driven[(x as { dataIndex: number }).dataIndex];
                  return `${r.driver_name}\nscore ${r.safety_score} · speeding ${r.speeding_per_100km} · harsh ${r.harsh_per_100km} per 100 km`; } },
                xAxis: { type: "value", name: "speeding /100 km", nameLocation: "middle", nameGap: 22 }, yAxis: { type: "value", name: "harsh /100 km" },
                series: [{ type: "scatter", symbolSize: 4, data: driven.map((r) => [r.speeding_per_100km ?? 0, r.harsh_per_100km ?? 0]),
                  itemStyle: { color: dark ? "rgba(129,140,248,.45)" : "rgba(99,102,241,.4)" },
                  markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: dark ? "#5d6480" : "#9aa0b4", width: 1 }, label: { show: false },
                    data: [{ xAxis: lim.alert_speeding_per_100km ?? 2 }, { yAxis: lim.alert_harsh_per_100km ?? 3 }] } }],
              })} />
            </Card>
          </div>
        </>
      )}

      <SectionTitle sub="Lowest score first. Licence dates come from your drivers sheet; driving figures cover the alert window.">Driver register</SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
          <MagnifyingGlass size={15} className="text-faint" />
          <input aria-label="Search drivers" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name, driver id, plate or site…" className="w-full bg-transparent text-[13px] outline-none" />
        </div>
        {drivers.data ? (
          <>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[900px] text-[12.5px]">
                <thead className="text-left text-faint"><tr className="[&>th]:py-1.5 [&>th]:font-medium">
                  <th>Driver</th><th>Vehicle</th><th>Site</th><th className="text-right">Score</th><th className="text-right">Km</th>
                  <th className="text-right">Speeding</th><th className="text-right">Harsh</th><th className="text-right">Idle</th><th className="pl-4">Licence</th></tr></thead>
                <tbody>{register.slice(page * PAGE, (page + 1) * PAGE).map((r) => (
                  <tr key={r.driver_id} className="border-t border-border [&>td]:py-2">
                    <td><b className="font-semibold">{r.driver_name}</b><span className="block text-[11px] text-faint">{r.driver_id}{r.licence_class ? ` · class ${r.licence_class}` : ""}</span></td>
                    <td>{r.plate ?? r.vehicle_id ?? "–"}</td>
                    <td className="text-muted">{r.site_name ?? "–"}</td>
                    <td className="text-right font-semibold" style={{ color: r.safety_score === null ? undefined : attention(r.safety_score < 55 ? "red" : r.safety_score < 70 ? "amber" : null) }}>
                      {r.safety_score ?? "–"}{r.safety_score !== null && <span className="ml-1 font-normal text-faint">{band(r.safety_score)}</span>}</td>
                    <td className="text-right">{Math.round(r.km).toLocaleString()}</td>
                    <td className="text-right" style={{ color: attention(rag(r.speeding_per_100km, lim.alert_speeding_per_100km)) }}>{r.speeding_per_100km ?? "–"}</td>
                    <td className="text-right" style={{ color: attention(rag(r.harsh_per_100km, lim.alert_harsh_per_100km)) }}>{r.harsh_per_100km ?? "–"}</td>
                    <td className="text-right" style={{ color: attention(rag(r.idle_pct, lim.alert_idle_pct)) }}>{r.idle_pct === null ? "–" : `${r.idle_pct}%`}</td>
                    <td className="pl-4" style={{ color: r.licence_status === "Expired" ? "var(--bad)" : r.licence_status === "Expiring" ? "var(--warn)" : "var(--muted)" }}>
                      {r.licence_status}{r.licence_expiry ? ` · ${r.licence_expiry}` : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
              <span>{register.length.toLocaleString()} drivers · page {page + 1} of {Math.max(1, Math.ceil(register.length / PAGE))}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="ops-button">Previous</button>
                <button disabled={(page + 1) * PAGE >= register.length} onClick={() => setPage(page + 1)} className="ops-button">Next</button>
              </div>
            </div>
          </>
        ) : <Skeleton height={400} />}
      </Card>
      {status === "failed" && <p className="mt-4 text-bad">The pipeline did not finish; see Pipeline & your data.</p>}
    </>
  );
}
