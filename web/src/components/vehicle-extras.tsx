"use client";

import { useMemo } from "react";
import { Envelope, Phone } from "@phosphor-icons/react";
import { Chart, PALETTE, STATUS } from "./chart";
import { regionWhere, useSql } from "./engine-provider";
import { Card, Skeleton, StatStrip } from "./ui";

/** Warranty cover, add-on equipment and the manufacturer's service-centre contacts: per vehicle and across the fleet. */

export const WARRANTY_COLOR: Record<string, string> = {
  Active: "var(--good)", Covered: "var(--good)", Expiring: "var(--warn)", "Partly covered": "var(--warn)",
  Expired: "var(--bad)", "Expired (km)": "var(--bad)", Void: "var(--bad)", "Out of warranty": "var(--bad)", Unknown: "var(--faint)",
};
const CATEGORY_EMOJI: Record<string, string> = {
  Charging: "⚡", "Battery & thermal": "🔋", "Self-driving": "🤖", Safety: "🛡️", Telematics: "📡", Body: "🧰",
};
const coverageEmoji = (c: string) =>
  /battery/i.test(c) ? "🔋" : /power/i.test(c) ? "⚙️" : /self.?driv|adas/i.test(c) ? "🤖" : /corros/i.test(c) ? "🌧️" : /extend|plan/i.test(c) ? "➕" : "🧾";
const roleEmoji = (r: string) =>
  /warrant/i.test(r) ? "📋" : /ev|high.?volt|battery/i.test(r) ? "⚡" : /self.?driv|calibr|adas/i.test(r) ? "🤖" : /part/i.test(r) ? "📦" : /road|assist|24/i.test(r) ? "🚨" : "🧑‍🔧";
const money = (n: number | null | undefined) => (n == null ? "–" : `$${Math.round(n).toLocaleString()}`);
const q = (s: string) => s.replace(/'/g, "''");

interface WarrantyRow { coverage: string; provider: string | null; start_date: string; end_date: string; km_limit: number | null; km_driven: number; km_left: number | null; days_left: number; warranty_status: string; contract_number: string | null }
interface AddonRow { addon: string; category: string; installed_date: string | null; supplier: string | null; serial_number: string | null; software_version: string | null; cost: number | null; warranty_end: string | null; addon_warranty_status: string }
interface ContactRow { service_centre: string; region: string | null; role: string; name: string; phone: string | null; email: string | null; hours: string | null }

/** Share of the cover used up, by date or by kilometres, whichever is further along. */
function used(w: WarrantyRow, today: number): number {
  const s = Date.parse(w.start_date), e = Date.parse(w.end_date);
  const byDate = e > s ? (today - s) / (e - s) : 1;
  const byKm = w.km_limit ? w.km_driven / w.km_limit : 0;
  return Math.max(0, Math.min(1, Math.max(byDate, byKm)));
}

/** The drawer sections for one vehicle. */
export function VehicleExtras({ vehicleId, region, make }: { vehicleId: string; region: string | null; make: string | null }) {
  const id = q(vehicleId);
  const w = useSql<WarrantyRow>(`SELECT coverage, provider, start_date::VARCHAR AS start_date, end_date::VARCHAR AS end_date, km_limit, km_driven, km_left, days_left, warranty_status, contract_number
    FROM stg_warranties WHERE vehicle_id = '${id}' ORDER BY end_date`);
  const a = useSql<AddonRow>(`SELECT addon, category, installed_date::VARCHAR AS installed_date, supplier, serial_number, software_version, cost, warranty_end::VARCHAR AS warranty_end, addon_warranty_status
    FROM stg_vehicle_addons WHERE vehicle_id = '${id}' ORDER BY category, addon`);
  const c = useSql<ContactRow>(`SELECT service_centre, region, role, name, phone, email, hours FROM stg_service_contacts
    WHERE (${make ? `lower(make) = lower('${q(make)}')` : "TRUE"}) ORDER BY ${region ? `region = '${q(region)}' DESC,` : ""} region, contact_id`);
  const snapshot = useSql<{ d: string }>("SELECT snapshot_date()::VARCHAR AS d");
  const today = snapshot.data?.[0] ? Date.parse(snapshot.data[0].d) : 0;
  const contacts = useMemo(() => {
    const rows = c.data ?? [];
    const centre = rows[0]?.service_centre;
    return rows.filter((r) => r.service_centre === centre);
  }, [c.data]);
  const groups = useMemo(() => {
    const m = new Map<string, AddonRow[]>();
    (a.data ?? []).forEach((r) => m.set(r.category, [...(m.get(r.category) ?? []), r]));
    return [...m.entries()];
  }, [a.data]);

  return (
    <>
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold"><span className="emoji-tile emoji-sm" aria-hidden="true">🛡️</span>Warranty</h3>
      {!w.data ? <Skeleton height={80} /> : w.data.length ? (
        <ul className="grid gap-2">
          {w.data.map((r) => {
            const u = today ? used(r, today) : 0, color = WARRANTY_COLOR[r.warranty_status] ?? "var(--faint)";
            return (
              <li key={r.coverage} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true">{coverageEmoji(r.coverage)}</span><span className="truncate font-medium">{r.coverage}</span></span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{r.warranty_status}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`${Math.round(u * 100)}% of the cover used`}>
                  <div className="warranty-bar h-full rounded-full" style={{ width: `${u * 100}%`, background: color }} />
                </div>
                <p className="tnum mt-1.5 text-[11.5px] text-muted">
                  {r.start_date} → {r.end_date}{r.days_left > 0 ? ` · ${r.days_left.toLocaleString()} days left` : ""}
                  {r.km_limit ? ` · ${Math.round(r.km_driven).toLocaleString()} of ${Math.round(r.km_limit).toLocaleString()} km` : ""}
                  {r.provider ? ` · ${r.provider}` : ""}{r.contract_number ? ` · ${r.contract_number}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[13px] text-muted">No warranty on file. Add a <b>warranties</b> sheet on the Import page.</p>}

      <h3 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold"><span className="emoji-tile emoji-sm" aria-hidden="true">🧩</span>Add-ons and extra equipment</h3>
      {!a.data ? <Skeleton height={80} /> : groups.length ? groups.map(([cat, items]) => (
        <div key={cat} className="mb-2">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted"><span aria-hidden="true">{CATEGORY_EMOJI[cat] ?? "🧩"}</span>{cat}</p>
          {items.map((r) => (
            <div key={r.addon} className="flex justify-between gap-3 border-b border-border py-1.5 text-[12.5px]">
              <span className="min-w-0">
                <span className="block truncate">{r.addon}</span>
                <span className="block truncate text-[11px] text-faint">{[r.supplier, r.serial_number, r.software_version, r.installed_date && `fitted ${r.installed_date}`].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="tnum shrink-0 text-right text-[11.5px]">
                <span className="block">{money(r.cost)}</span>
                {r.warranty_end && <span className="block" style={{ color: STATUS_DOC[r.addon_warranty_status] }}>cover to {r.warranty_end}</span>}
              </span>
            </div>
          ))}
        </div>
      )) : <p className="text-[13px] text-muted">No add-ons recorded. Add a <b>vehicle_addons</b> sheet on the Import page.</p>}

      <h3 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold"><span className="emoji-tile emoji-sm" aria-hidden="true">📞</span>Service centre contacts{contacts[0] ? ` · ${contacts[0].service_centre}` : ""}</h3>
      {!c.data ? <Skeleton height={80} /> : contacts.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {contacts.map((r) => (
            <li key={r.role + r.name} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted"><span aria-hidden="true">{roleEmoji(r.role)}</span>{r.role}</p>
              <p className="mt-0.5 font-medium">{r.name}</p>
              {r.phone && <a className="mt-1 flex items-center gap-1 text-accent hover:underline" href={`tel:${r.phone.replace(/\s+/g, "")}`}><Phone size={12} />{r.phone}</a>}
              {r.email && <a className="flex min-w-0 items-center gap-1 text-accent hover:underline" href={`mailto:${r.email}`}><Envelope size={12} /><span className="truncate">{r.email}</span></a>}
              {r.hours && <p className="text-[11px] text-faint">{r.hours}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-muted">No service contacts for {make ?? "this make"}. Add a <b>service_contacts</b> sheet on the Import page.</p>}
    </>
  );
}
const STATUS_DOC: Record<string, string> = { Valid: "var(--good)", Expiring: "var(--warn)", Expired: "var(--bad)", Unknown: "var(--faint)" };

interface FleetWarranty { void_coverages: number; warranty_position: string; self_driving: boolean; addons: number; addons_value: number; electric_addons: number; next_to_end: string | null; next_end_date: string | null; powertrain: string | null; self_driving_software: string | null }

/** The fleet-wide warranty and add-on section on the Fleet register. */
export function WarrantyOverview({ region }: { region: string | null }) {
  const v = useSql<FleetWarranty>(`SELECT void_coverages, warranty_position, self_driving, addons, addons_value, electric_addons, next_to_end, next_end_date::VARCHAR AS next_end_date, powertrain, self_driving_software
    FROM mart_vehicle_warranty${regionWhere(region)}`);
  const ends = useSql<{ m: string; coverage: string; n: number }>(`SELECT strftime(date_trunc('month', end_date), '%Y-%m') AS m, coverage, count(*)::INTEGER AS n
    FROM stg_warranties WHERE warranty_status IN ('Active', 'Expiring') AND end_date < snapshot_date() + INTERVAL 24 MONTH${region ? ` AND region = '${q(region)}'` : ""} GROUP BY ALL ORDER BY 1`);
  const cats = useSql<{ category: string; n: number; vehicles: number; value: number }>(`SELECT a.category, count(*)::INTEGER AS n, count(DISTINCT a.vehicle_id)::INTEGER AS vehicles, sum(a.cost) AS value
    FROM stg_vehicle_addons a JOIN stg_vehicles v USING (vehicle_id) WHERE v.is_active${region ? ` AND v.region = '${q(region)}'` : ""} GROUP BY 1 ORDER BY 2 DESC`);
  const rows = useMemo(() => v.data ?? [], [v.data]);
  const k = useMemo(() => {
    const n = rows.length, known = rows.filter((r) => r.warranty_position !== "Unknown").length;
    const pct = (x: number) => (known ? (100 * x) / known : null);
    return {
      known, covered: pct(rows.filter((r) => ["Covered", "Expiring"].includes(r.warranty_position)).length),
      expiring: rows.filter((r) => r.warranty_position === "Expiring").length,
      partly: rows.filter((r) => r.warranty_position === "Partly covered").length,
      out: rows.filter((r) => r.warranty_position === "Out of warranty").length,
      sd: rows.filter((r) => r.self_driving).length, n,
      ev: rows.filter((r) => r.electric_addons > 0).length,
      value: rows.reduce((s, r) => s + (r.addons_value ?? 0), 0),
      void: rows.reduce((s, r) => s + (r.void_coverages ?? 0), 0),
    };
  }, [rows]);
  if (v.data && !k.known && !rows.some((r) => r.addons)) {
    return <Card><p className="text-[13.5px] text-muted">🛡️ No warranties or add-ons yet. Add a <b>warranties</b>, <b>vehicle_addons</b> or <b>service_contacts</b> sheet on the Import page to see cover, equipment and who to call for each VIN.</p></Card>;
  }
  const positions = ["Covered", "Expiring", "Partly covered", "Out of warranty", "Unknown"];
  return (
    <>
      <StatStrip items={[
        { label: "Under basic warranty", value: k.covered, unit: "%", decimals: 1, status: k.covered === null ? null : k.covered >= 60 ? "green" : "amber" },
        { label: "Basic cover ending, 90 days", value: k.expiring, status: k.expiring ? "amber" : "green", note: "Book a pre-expiry inspection" },
        { label: "Partly covered", value: k.partly, note: "Powertrain or battery only" },
        { label: "Out of warranty", value: k.out, status: k.out ? "red" : "green" },
        { label: "Self-driving equipped", value: k.sd, note: k.n ? `${((100 * k.sd) / k.n).toFixed(1)}% of the fleet` : undefined },
        { label: "With EV add-ons", value: k.ev, note: "Chargers, battery and thermal" },
        { label: "Add-on value ($)", value: k.value, decimals: 0 },
        { label: "Warranty void", value: k.void, status: k.void ? "red" : "green", note: "Cover the maker refused" },
      ]} />
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="🛡️ Warranty position" sub="Active vehicles, by their basic cover">
          {v.data ? <Chart height={260} option={() => ({
            tooltip: { trigger: "item" },
            series: [{ type: "pie", radius: ["52%", "78%"], itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 2 }, label: { show: false }, emphasis: { scale: true },
              data: positions.map((p) => ({ name: p, value: rows.filter((r) => r.warranty_position === p).length,
                itemStyle: { color: { Covered: STATUS.good, Expiring: STATUS.warn, "Partly covered": "#A5B4FC", "Out of warranty": STATUS.bad, Unknown: STATUS.neutral }[p] } })).filter((d) => d.value) }],
          })} /> : <Skeleton height={260} />}
        </Card>
        <Card title="📅 Cover ending, next 24 months" sub="Each bar is a month, split by coverage">
          {ends.data ? <Chart height={260} option={() => {
            const months = [...new Set(ends.data!.map((r) => r.m))].sort();
            const covs = [...new Set(ends.data!.map((r) => r.coverage))];
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: { type: "scroll" },
              grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
              xAxis: { type: "category", data: months }, yAxis: { type: "value" },
              series: covs.map((c, i) => ({ name: c, type: "bar" as const, stack: "c", itemStyle: { color: PALETTE[i % PALETTE.length] },
                data: months.map((m) => ends.data!.find((r) => r.m === m && r.coverage === c)?.n ?? 0) })),
            };
          }} /> : <Skeleton height={260} />}
        </Card>
        <Card title="🧩 Add-ons by category" sub="Vehicles fitted, and what the equipment cost">
          {cats.data ? <ul className="mt-1 grid gap-2.5">
            {cats.data.map((c) => {
              const max = Math.max(...cats.data!.map((x) => x.vehicles));
              return (
                <li key={c.category} className="text-[12.5px]">
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="emoji-tile emoji-sm" aria-hidden="true">{CATEGORY_EMOJI[c.category] ?? "🧩"}</span>{c.category}</span>
                    <span className="tnum text-muted">{c.vehicles.toLocaleString()} vehicles · {money(c.value)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="warranty-bar h-full rounded-full bg-accent" style={{ width: `${(100 * c.vehicles) / max}%` }} /></div>
                </li>
              );
            })}
          </ul> : <Skeleton height={260} />}
        </Card>
      </div>
      <SelfDriving rows={rows} />
    </>
  );
}

function SelfDriving({ rows }: { rows: FleetWarranty[] }) {
  const sd = rows.filter((r) => r.self_driving);
  if (!sd.length) return null;
  const versions = new Map<string, number>();
  sd.forEach((r) => { const s = r.self_driving_software ?? "Not recorded"; versions.set(s, (versions.get(s) ?? 0) + 1); });
  const list = [...versions.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const latest = list[0]?.[0];
  return (
    <Card className="mt-3" title="🤖 Self-driving fleet" sub="Vehicles with self-driving hardware, by software version. Cars behind the latest release are due an update at the service centre.">
      <div className="flex flex-wrap gap-2">
        {list.map(([ver, n]) => (
          <span key={ver} className="tnum rounded-lg border border-border px-3 py-2 text-[12.5px]">
            <b className={ver === latest ? "text-accent" : undefined}>{ver}</b> · {n.toLocaleString()} vehicle{n === 1 ? "" : "s"}{ver === latest ? " · latest" : ""}
          </span>
        ))}
      </div>
    </Card>
  );
}
