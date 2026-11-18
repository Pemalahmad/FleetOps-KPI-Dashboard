"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, CalendarPlus, CloudArrowDown, FileXls, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Chart, PALETTE, STATUS } from "@/components/chart";
import { regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton, StatStrip } from "@/components/ui";
import { decodeVins } from "@/lib/vin";
import { renewalsIcs, safeRows } from "@/lib/exporters";
import { cleanName, withoutPrefix } from "@/lib/names";
import { CarShapes } from "@/components/garage/car-shapes";

export interface RegistryRow {
  vehicle_id: string; vin: string | null; vin_status: string; plate_number: string | null; make: string | null; model: string | null;
  model_year: number | null; trim: string | null; configuration: string | null; color: string | null; powertrain: string | null;
  region: string | null; home_site_id: string | null; use_case: string | null; is_active: boolean; in_service_date: string | null;
  age_months: number | null; purchase_cost: number | null; book_value: number | null;
  registration_expiry: string | null; registration_status: string; registration_days_left: number | null;
  insurance_expiry: string | null; insurance_status: string; insurance_days_left: number | null; insurer: string | null;
  registration_docs: number; insurance_docs: number; documents: number; visits: number; open_jobs: number;
  last_visit: string | null; service_spend: number; fines: number; unpaid_fines: number; next_action: string | null;
}

const STATUS_COLOR: Record<string, string> = { Valid: "var(--muted)", Expiring: STATUS.warn, Expired: STATUS.bad, Unknown: STATUS.neutral };
const PT_COLOR: Record<string, string> = { BEV: PALETTE[0], PHEV: PALETTE[2], HEV: PALETTE[1], ICE: PALETTE[3], Unknown: PALETTE[7] };
const PAGE = 40;

export default function FleetPage() {
  const { region, dataset, workspace, status, log } = useEngine();
  const reg = useSql<RegistryRow>(`SELECT * FROM mart_fleet_registry${regionWhere(region)} ORDER BY vehicle_id`);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<RegistryRow | null>(null);
  const rows = useMemo(() => reg.data ?? [], [reg.data]);

  const k = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    const pct = (n: number) => (active.length ? (100 * n) / active.length : null);
    return {
      vehicles: rows.length, active: active.length,
      vinOk: rows.length ? (100 * rows.filter((r) => r.vin_status === "Valid").length) / rows.length : null,
      regOnFile: pct(active.filter((r) => r.registration_docs > 0).length),
      insOnFile: pct(active.filter((r) => r.insurance_docs > 0).length),
      grounded: active.filter((r) => r.registration_status === "Expired" || r.insurance_status === "Expired").length,
      due30: active.filter((r) => r.registration_status === "Expiring" || r.insurance_status === "Expiring").length,
      electrified: active.length ? (100 * active.filter((r) => ["BEV", "PHEV", "HEV"].includes(r.powertrain ?? "")).length) / active.length : null,
      avgAge: (() => { const a = active.filter((r) => r.age_months !== null); return a.length ? a.reduce((s, r) => s + r.age_months!, 0) / a.length / 12 : null; })(),
    };
  }, [rows]);

  const actions = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.next_action && m.set(r.next_action, (m.get(r.next_action) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => (a[0].startsWith("Ground") ? -1 : 0) - (b[0].startsWith("Ground") ? -1 : 0) || b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!action || r.next_action === action) &&
      (!t || [r.vehicle_id, r.vin, r.plate_number, r.make, r.model, r.trim, r.configuration].some((x) => x?.toLowerCase().includes(t))));
  }, [rows, q, action]);

  return (
    <>
      <PageHeader eyebrow={dataset === "mine" ? "My fleet" : "Demo fleet"} title="Fleet register">
        Every vehicle with its identity (VIN, plate, make, model, year, trim, configuration), its licence to drive (registration,
        insurance and the documents behind them) and its service record, with one next action per vehicle.
        {dataset === "demo" && <> <Link href="/import/" className="text-accent hover:underline">Import your own fleet</Link> to see yours.</>}
      </PageHeader>

      {log?.mode === "registry" && (
        <Card className="mb-4">
          <p className="text-[13.5px] text-muted">
            <b className="text-text">Registry mode.</b> Your register and compliance are live. Add work orders (and usage) on the{" "}
            <Link href="/import/" className="text-accent hover:underline">import page</Link> to unlock the operations KPIs, the three clocks and the metric network.
          </p>
        </Card>
      )}

      <StatStrip items={[
        { label: "Vehicles", value: k.vehicles, note: `${k.active.toLocaleString()} active` },
        { label: "VINs valid", value: k.vinOk, unit: "%", decimals: 1, status: k.vinOk === null ? null : k.vinOk >= 99 ? "green" : k.vinOk >= 95 ? "amber" : "red" },
        { label: "Registration on file", value: k.regOnFile, unit: "%", decimals: 1, status: k.regOnFile === null ? null : k.regOnFile >= 95 ? "green" : k.regOnFile >= 80 ? "amber" : "red" },
        { label: "Insurance on file", value: k.insOnFile, unit: "%", decimals: 1, status: k.insOnFile === null ? null : k.insOnFile >= 95 ? "green" : k.insOnFile >= 80 ? "amber" : "red" },
        { label: "Grounded", value: k.grounded, status: k.grounded ? "red" : "green", note: "Expired document" },
        { label: "Due in 30 days", value: k.due30, note: "Registration or insurance", status: k.due30 ? "amber" : "green" },
        { label: "Average age", value: k.avgAge, unit: "yr", decimals: 1 },
        { label: "Electrified", value: k.electrified, unit: "%", decimals: 0, note: "BEV, PHEV or hybrid" },
      ]} />

      {dataset === "mine" && workspace && <VinDecode rows={rows} />}

      <SectionTitle sub="What the fleet is made of: every model with its trims, and the age and powertrain mix.">Composition</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card title="Make → model → trim" sub="Each bar is a model, split by trim">
          {reg.data ? <ModelMix rows={rows} /> : <Skeleton height={380} />}
        </Card>
        <Card title="Model year by powertrain" sub="Vehicles by model year">
          {reg.data ? <Chart height={340} option={() => {
            const years = [...new Set(rows.map((r) => r.model_year).filter((y): y is number => y !== null))].sort();
            const pts = [...new Set(rows.map((r) => r.powertrain ?? "Unknown"))].sort();
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: {},
              xAxis: { type: "category", data: years.map(String) }, yAxis: { type: "value" },
              series: pts.map((p) => ({ name: p, type: "bar" as const, stack: "y", itemStyle: { color: PT_COLOR[p] ?? "#94A3B8" },
                data: years.map((y) => rows.filter((r) => r.model_year === y && (r.powertrain ?? "Unknown") === p).length) })),
            };
          }} /> : <Skeleton height={380} />}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Configurations" sub="Most common first">
          {reg.data ? <Chart height={280} option={(dark) => {
            const m = new Map<string, number>();
            rows.forEach((r) => { const c = cleanName(r.configuration) ?? "Not recorded"; m.set(c, (m.get(c) ?? 0) + 1); });
            const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).reverse();
            return {
              grid: { left: 8, right: 50, top: 8, bottom: 8, containLabel: true }, tooltip: { trigger: "axis", axisPointer: { type: "none" } },
              xAxis: { type: "value" }, yAxis: { type: "category", data: top.map((t) => t[0]), axisLabel: { width: 220, overflow: "truncate" } },
              series: [{ type: "bar", barWidth: "60%", itemStyle: { color: "#6366F1", borderRadius: [0, 3, 3, 0] },
                label: { show: true, position: "right", color: dark ? "#9097b0" : "#5b6178", textBorderWidth: 0 }, data: top.map((t) => t[1]) }],
            };
          }} /> : <Skeleton height={280} />}
        </Card>
        <Card title="Renewals due, next 12 weeks" sub="Registration and insurance; book inspections before the wave">
          {reg.data ? <Chart height={280} option={() => {
            const weeks = Array.from({ length: 12 }, (_, i) => i);
            const count = (f: (r: RegistryRow) => number | null) => weeks.map((w) => rows.filter((r) => { const d = f(r); return r.is_active && d !== null && d >= w * 7 && d < (w + 1) * 7; }).length);
            return {
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: {},
              xAxis: { type: "category", data: weeks.map((w) => `wk ${w + 1}`) }, yAxis: { type: "value" },
              series: [
                { name: "Registration", type: "bar", stack: "r", itemStyle: { color: PALETTE[0] }, data: count((r) => r.registration_days_left) },
                { name: "Insurance", type: "bar", stack: "r", itemStyle: { color: PALETTE[1] }, data: count((r) => r.insurance_days_left) },
              ],
            };
          }} /> : <Skeleton height={280} />}
        </Card>
      </div>

      <div id="car-shapes" className="scroll-mt-28">
        <SectionTitle sub="The 3D garage draws each model in this shape and in its registered colour. Change any that look wrong.">Car shapes in the garage</SectionTitle>
      </div>
      <Card>{reg.data ? <CarShapes rows={rows} /> : <Skeleton height={160} />}</Card>

      <SectionTitle sub="One action per vehicle, most urgent first. Law 6: an expired vehicle is grounded until renewed.">Next actions</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={() => {
          const items = rows.filter((r) => r.is_active).flatMap((r) => [
            r.registration_expiry ? { vehicle: r.plate_number ?? r.vehicle_id, kind: "Registration" as const, date: r.registration_expiry, detail: r.vin ? `VIN ${r.vin}` : null } : null,
            r.insurance_expiry ? { vehicle: r.plate_number ?? r.vehicle_id, kind: "Insurance" as const, date: r.insurance_expiry, detail: r.insurer } : null,
          ]).filter((x): x is NonNullable<typeof x> => x !== null);
          download(new Blob([renewalsIcs(items)], { type: "text/calendar" }), "fleet-renewals.ics");
        }} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted transition hover:border-accent hover:text-accent active:scale-95 disabled:opacity-40">
          <CalendarPlus size={15} /> Add renewals to my calendar (.ics, alerts 30 and 7 days before)
        </button>
        <button onClick={async () => {
          const XLSX = await import("xlsx");
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeRows(filtered as unknown as Record<string, unknown>[])), "Fleet register");
          XLSX.writeFile(wb, "fleet-register.xlsx");
        }} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted transition hover:border-accent hover:text-accent active:scale-95 disabled:opacity-40">
          <FileXls size={15} /> Export {action || q ? "this view" : "the register"} to Excel
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setAction(null); setPage(0); }}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] ${action === null ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}>
          All vehicles · {rows.length.toLocaleString()}
        </button>
        {actions.map(([a, n]) => (
          <button key={a} onClick={() => { setAction(a); setPage(0); }}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${action === a ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text"}`}
            style={a.startsWith("Ground") && action !== a ? { color: "var(--bad)", borderColor: "color-mix(in srgb, var(--bad) 40%, transparent)" } : undefined}>
            {a} · {n.toLocaleString()}
          </button>
        ))}
      </div>

      <Card className="mt-3">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
          <MagnifyingGlass size={15} className="text-faint" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search plate, VIN, fleet number, make, model, trim…"
            className="w-full bg-transparent text-[13px] outline-none" />
        </div>
        {reg.data ? (
          <>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[980px] text-[12.5px]">
                <thead className="text-left text-faint">
                  <tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Plate</th><th className="font-medium">VIN</th>
                    <th className="font-medium">Make · model</th><th className="font-medium">Year</th><th className="font-medium">Trim</th>
                    <th className="font-medium">Registration</th><th className="font-medium">Insurance</th><th className="font-medium">Next action</th></tr>
                </thead>
                <tbody>{filtered.slice(page * PAGE, (page + 1) * PAGE).map((r) => (
                  <tr key={r.vehicle_id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-border transition hover:bg-panel-2">
                    <td className="py-2 font-medium">{r.vehicle_id}</td>
                    <td>{r.plate_number ?? "–"}</td>
                    <td className="font-mono text-[11.5px]" style={{ color: r.vin_status === "Valid" ? undefined : "var(--bad)" }}>{r.vin ?? "–"}</td>
                    <td>{[cleanName(r.make), cleanName(r.model)].filter(Boolean).join(" ") || "–"}</td>
                    <td>{r.model_year ?? "–"}</td>
                    <td className="max-w-[140px] truncate">{cleanName(r.trim) ?? "–"}</td>
                    <td style={{ color: STATUS_COLOR[r.registration_status] }}>{r.registration_status}{r.registration_docs ? "" : " ·  no card"}</td>
                    <td style={{ color: STATUS_COLOR[r.insurance_status] }}>{r.insurance_status}</td>
                    <td className="text-muted">{r.next_action ?? "–"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
              <span>{filtered.length.toLocaleString()} vehicles · page {page + 1} of {Math.max(1, Math.ceil(filtered.length / PAGE))}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40">Previous</button>
                <button disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)} className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        ) : <Skeleton height={400} />}
      </Card>

      <VehicleDrawer row={open} onClose={() => setOpen(null)} />
      {status === "failed" && <p className="mt-4 text-bad">The pipeline did not finish; see Pipeline & your data.</p>}
    </>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const TRIM_TONES = PALETTE;

function ModelMix({ rows }: { rows: RegistryRow[] }) {
  const tree = useMemo(() => {
    const makes = new Map<string, { label: string; n: number; models: Map<string, { label: string; n: number; trims: Map<string, { label: string; n: number }> }> }>();
    for (const r of rows) {
      const make = cleanName(r.make) ?? "Make not recorded";
      const model = withoutPrefix(cleanName(r.model) ?? "Model not recorded", make);
      const trim = withoutPrefix(cleanName(r.trim) ?? "No trim", model);
      const mk = make.toLowerCase(), md = model.toLowerCase(), tr = trim.toLowerCase();
      const m = makes.get(mk) ?? { label: make, n: 0, models: new Map() }; makes.set(mk, m); m.n++;
      const o = m.models.get(md) ?? { label: model, n: 0, trims: new Map() }; m.models.set(md, o); o.n++;
      const t = o.trims.get(tr) ?? { label: trim, n: 0 }; o.trims.set(tr, t); t.n++;
    }
    return [...makes.values()].sort((a, b) => b.n - a.n);
  }, [rows]);
  const [pick, setPick] = useState<string | null>(null);
  const make = tree.find((m) => m.label === pick) ?? null;
  const models = (make ? [...make.models.values()] : tree.flatMap((m) => [...m.models.values()].map((o) => ({ ...o, label: tree.length > 1 ? m.label + " " + o.label : o.label }))))
    .sort((a, b) => b.n - a.n);
  const total = make?.n ?? rows.length;
  const [all, setAll] = useState(false);
  const shown = all ? models : models.slice(0, 7);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setPick(null)} className={"ops-chip " + (!make ? "ops-chip-active" : "")}>
          {tree.length === 1 ? tree[0].label : "All makes"}<span className="tnum ml-1.5 text-faint">{rows.length.toLocaleString()}</span>
        </button>
        {tree.length > 1 && tree.map((m) => (
          <button key={m.label} onClick={() => setPick(m.label)} className={"ops-chip " + (make === m ? "ops-chip-active" : "")}>
            {m.label}<span className="tnum ml-1.5 text-faint">{m.n.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <ul className="divide-y divide-border">
        {shown.map((o) => {
          const trims = [...o.trims.values()].sort((a, b) => b.n - a.n);
          return (
            <li key={o.label} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-semibold">{o.label}</span>
                <span className="tnum shrink-0 text-[12px] text-muted"><b className="font-semibold text-text">{o.n.toLocaleString()}</b> · {(100 * o.n / total).toFixed(1)}%</span>
              </div>
              <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-panel-2" style={{ width: Math.max(8, (100 * o.n) / models[0].n) + "%" }}
                role="img" aria-label={o.label + ": " + trims.map((t) => t.label + " " + t.n).join(", ")}>
                {trims.map((t, i) => <span key={t.label} title={t.label + " · " + t.n.toLocaleString()} style={{ width: (100 * t.n) / o.n + "%", background: TRIM_TONES[i % TRIM_TONES.length], opacity: 1 - i * 0.08 }} className="h-full border-r border-panel last:border-r-0" />)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
                {trims.map((t, i) => (
                  <span key={t.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: TRIM_TONES[i % TRIM_TONES.length], opacity: 1 - i * 0.08 }} />
                    {t.label} <span className="tnum text-faint">{t.n.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {models.length > 7 && (
        <button onClick={() => setAll(!all)} className="mt-1 text-[12px] font-medium text-accent hover:underline">
          {all ? "Show fewer models" : `Show all ${models.length} models`}
        </button>
      )}
    </div>
  );
}

function VinDecode({ rows }: { rows: RegistryRow[] }) {
  const { workspace, commit } = useEngine();
  const [state, setState] = useState<{ busy: boolean; done: number; msg: string | null }>({ busy: false, done: 0, msg: null });
  const todo = rows.filter((r) => r.vin && r.vin_status === "Valid" && (!r.trim || !r.model || !r.configuration) && !workspace?.vinSpecs[r.vin]).map((r) => r.vin!);
  if (!todo.length && !state.msg) return null;
  async function run() {
    if (!workspace) return;
    setState({ busy: true, done: 0, msg: null });
    try {
      const specs = await decodeVins(todo, (done) => setState((s) => ({ ...s, done })));
      const vinSpecs = { ...workspace.vinSpecs, ...Object.fromEntries(specs.map((s) => [s.vin, s])) };
      await commit({ ...workspace, vinSpecs });
      const found = specs.filter((s) => s.make || s.model).length;
      setState({ busy: false, done: todo.length, msg: `Decoded ${found} of ${specs.length} VINs. Blank make, model, year, trim and configuration were filled; nothing you supplied was overwritten.` });
    } catch (e) {
      setState({ busy: false, done: 0, msg: `Decoding failed: ${(e as Error).message}. Your data is unchanged.` });
    }
  }
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-3xl text-[13px] text-muted">
          {state.msg ?? <><b className="text-text">{todo.length.toLocaleString()} valid {todo.length === 1 ? "VIN is" : "VINs are"}</b> missing model, trim or configuration. {todo.length === 1 ? "It" : "They"} can be decoded with
            NHTSA&apos;s public vPIC service (best for vehicles built for North America; others often decode make and year only). Only the VINs are sent, nothing else.</>}
        </div>
        {todo.length > 0 && (
          <button onClick={run} disabled={state.busy}
            className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-[13px] font-medium text-accent transition hover:bg-accent-soft active:scale-95 disabled:opacity-50">
            <CloudArrowDown size={16} /> {state.busy ? `Decoding… ${state.done}/${todo.length}` : `Decode ${todo.length.toLocaleString()} VIN${todo.length === 1 ? "" : "s"} online`}
          </button>
        )}
      </div>
    </Card>
  );
}

function F({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 text-[13px]"><span className="text-muted">{k}</span><span className="text-right">{v ?? "–"}</span></div>
  );
}

function VehicleDrawer({ row, onClose }: { row: RegistryRow | null; onClose: () => void }) {
  const id = row?.vehicle_id?.replace(/'/g, "''");
  const wo = useSql<{ work_order_id: string; job_type: string; issue_category: string; key_in_ts: string; key_to_key_h: number | null; total_cost: number | null }>(
    id ? `SELECT work_order_id, job_type, issue_category, key_in_ts, key_to_key_h, total_cost FROM stg_work_orders WHERE vehicle_id = '${id}' ORDER BY key_in_ts DESC LIMIT 8` : null);
  const docs = useSql<{ doc_type: string; document_number: string | null; expiry_date: string | null; status: string; issuer: string | null; file_name: string | null }>(
    id ? `SELECT doc_type, document_number, expiry_date, status, issuer, file_name FROM stg_documents WHERE vehicle_id = '${id}' ORDER BY expiry_date DESC` : null);
  return (
    <Dialog.Root open={!!row} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-full max-w-[520px] overflow-y-auto border-l border-border bg-panel p-6 shadow-2xl">
          {row && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12.5px] text-muted">{row.powertrain ?? "Vehicle"}</p>
                  <Dialog.Title className="text-[22px] font-semibold">{row.plate_number ?? row.vehicle_id}</Dialog.Title>
                  <Dialog.Description className="text-[13px] text-muted">
                    {[row.model_year, row.make, row.model, row.trim].filter(Boolean).join(" ") || "Model not recorded"}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-text" aria-label="Close"><X size={18} /></Dialog.Close>
              </div>
              {row.next_action && (
                <p className="mt-4 rounded-lg px-3 py-2 text-[13px] font-medium"
                  style={{ background: `color-mix(in srgb, ${row.next_action.startsWith("Ground") ? "var(--bad)" : "var(--warn)"} 14%, transparent)`,
                    color: row.next_action.startsWith("Ground") ? "var(--bad)" : "var(--warn)" }}>
                  {row.next_action}
                </p>
              )}
              <h3 className="mb-1 mt-5 text-[13px] font-semibold">Identity</h3>
              <F k="Fleet number" v={row.vehicle_id} />
              <F k="VIN" v={<span className="font-mono text-[12px]">{row.vin ?? "–"} <span style={{ color: row.vin_status === "Valid" ? "var(--good)" : "var(--bad)" }}>· {row.vin_status}</span></span>} />
              <F k="Configuration" v={row.configuration} />
              <F k="Colour" v={row.color} />
              <F k="Region · base" v={[row.region, row.home_site_id].filter(Boolean).join(" · ") || null} />
              <F k="In service" v={row.in_service_date ? `${row.in_service_date} (${Math.round((row.age_months ?? 0) / 12 * 10) / 10} yr)` : null} />
              <F k="Book value" v={row.book_value ? `$${Math.round(row.book_value).toLocaleString()}` : null} />
              <h3 className="mb-1 mt-5 text-[13px] font-semibold">Licence</h3>
              <F k="Registration" v={<span style={{ color: STATUS_COLOR[row.registration_status] }}>{row.registration_status}{row.registration_expiry ? ` · ${row.registration_expiry}` : ""}</span>} />
              <F k="Insurance" v={<span style={{ color: STATUS_COLOR[row.insurance_status] }}>{row.insurance_status}{row.insurance_expiry ? ` · ${row.insurance_expiry}` : ""}{row.insurer ? ` · ${row.insurer}` : ""}</span>} />
              <F k="Fines" v={row.fines ? `${row.fines}${row.unpaid_fines ? ` · $${Math.round(row.unpaid_fines).toLocaleString()} unpaid` : ""}` : "None"} />
              <h3 className="mb-1 mt-5 text-[13px] font-semibold">Documents on file</h3>
              {docs.data?.length ? docs.data.map((d, i) => (
                <F key={i} k={`${d.doc_type}${d.issuer ? ` · ${d.issuer}` : ""}`} v={<span style={{ color: STATUS_COLOR[d.status] }}>{d.expiry_date ?? "no expiry"} · {d.status}</span>} />
              )) : <p className="text-[13px] text-muted">None. <Link href="/documents/" className="text-accent hover:underline">Scan the registration card</Link>.</p>}
              <h3 className="mb-1 mt-5 text-[13px] font-semibold">Service history · {row.visits} visits · ${Math.round(row.service_spend).toLocaleString()}</h3>
              {wo.data?.length ? wo.data.map((w) => (
                <F key={w.work_order_id} k={`${w.key_in_ts?.slice(0, 10)} · ${w.job_type}`} v={`${w.issue_category ?? ""}${w.key_to_key_h ? ` · ${w.key_to_key_h.toFixed(0)} h` : ""}${w.total_cost ? ` · $${Math.round(w.total_cost)}` : ""}`} />
              )) : <p className="text-[13px] text-muted">No work orders recorded.</p>}
              <Link href="/workshop/" className="mt-5 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">Workshop view <ArrowRight size={13} /></Link>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

