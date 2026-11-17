"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { CheckCircle, DownloadSimple, FileXls, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { useEngine } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import type { TableSpec } from "@/lib/engine";
import { guessMapping, guessTable, readFile, toCsv, type Sheet } from "@/lib/sheets";
import { emptyWorkspace, uid, type SavedInput } from "@/lib/workspace";

interface Staged {
  sheet: Sheet;
  table: string | null;
  score: number;
  mapping: Record<string, string | null>;
}

const SKIP = "__skip";
const CONST = "__const";

const TABLE_LABEL: Record<string, string> = {
  vehicles: "Vehicle list (VINs, plates, trims)", documents: "Documents (registration, insurance)", work_orders: "Work orders / service history",
  sites: "Sites and workshops", usage: "Usage (odometer, hours)", energy: "Fuel and charging", feedback: "Customer ratings",
  parts_orders: "Parts orders", fines: "Fines", recalls: "Recall campaigns", recall_vehicles: "Recall vehicles", budgets: "Budgets",
};

export default function ImportPage() {
  const { engine, workspace, commit, status } = useEngine();
  const router = useRouter();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const tables = useMemo(() => engine?.manifest.tables ?? [], [engine]);
  const busy = status === "running" || status === "booting" || reading;

  async function onFiles(list: FileList | null) {
    if (!list?.length || !tables.length) return;
    setReading(true);
    setError(null);
    try {
      const sheets = (await Promise.all([...list].map((f) => readFile(f, tables)))).flat();
      if (!sheets.length) setError("No table found in those files. Each sheet needs a header row and at least one row of data.");
      setStaged((s) => [...s, ...sheets.map((sheet) => ({ sheet, ...guessTable(sheet, tables) }))]);
    } catch (e) {
      setError(`Could not read the file: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  const update = (i: number, patch: Partial<Staged>) => setStaged((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ready = staged.filter((s) => s.table);
  const willHaveWorkOrders = [...ready, ...(workspace?.inputs ?? [])].some((s) => s.table === "work_orders");

  async function addToFleet() {
    const ws = workspace ?? emptyWorkspace();
    const now = new Date().toISOString();
    const fresh: SavedInput[] = ready.map((s) => ({
      id: uid("in"), table: s.table!, label: s.sheet.id, kind: s.sheet.kind,
      csv: s.sheet.kind === "tabular" ? toCsv(s.sheet) : undefined, bytes: s.sheet.bytes, mapping: s.mapping,
      rows: s.sheet.rows.length, added: now,
    }));
    // re-importing the same file + sheet replaces it (an updated vehicle list, say)
    const kept = ws.inputs.filter((i) => !fresh.some((f) => f.label === i.label));
    await commit({ ...ws, inputs: [...kept, ...fresh] });
    setStaged([]);
    router.push("/fleet/");
  }

  async function removeInput(id: string) {
    if (!workspace) return;
    await commit({ ...workspace, inputs: workspace.inputs.filter((i) => i.id !== id) });
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    for (const t of tables) {
      const ws = XLSX.utils.aoa_to_sheet([t.columns.map((c) => c.name), t.columns.map((c) => c.example ?? "")]);
      XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
    }
    XLSX.writeFile(wb, "fleetops-template.xlsx");
  }

  return (
    <>
      <PageHeader eyebrow="Your fleet" title="Bring your fleet in">
        Drop the spreadsheets you already have: a vehicle list with VINs, plates, trims and configurations; a list of registration and
        insurance documents; service history if you have it. Every sheet is read, recognised and mapped for you to check. Your files
        stay in this browser.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
          className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-12 text-center transition ${drag ? "border-accent bg-accent-soft" : "hover:border-accent"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <FileXls size={34} className="text-accent" />
          <span className="text-[16px] font-semibold">{reading ? "Reading…" : "Drop Excel or CSV files, or click to choose"}</span>
          <span className="max-w-md text-[13px] text-muted">.xlsx, .xls, .csv, .parquet or .json. Workbooks with many sheets are fine: each sheet is recognised separately.</span>
          <input type="file" multiple accept=".xlsx,.xls,.xlsm,.csv,.parquet,.json" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        <Card title="Coming from another fleet system?">
          <p className="text-[13px] leading-relaxed text-muted">
            Export your vehicle list from <b className="text-text">Fleetio, Samsara, Motive, Geotab or Verizon Connect</b> as CSV or Excel and drop it
            here. Their usual column names (Name, Vehicle Number, VIN/SN, License Plate, Year, Trim…) are recognised; anything else you map once below.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Only a <b className="text-text">vehicle list</b> is needed to start. Work orders unlock the operations KPIs and the metric network.
          </p>
          <button onClick={downloadTemplate} disabled={!tables.length}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-muted transition hover:border-accent hover:text-accent active:scale-95">
            <DownloadSimple size={15} /> Download an Excel template (a sheet per table)
          </button>
        </Card>
      </div>
      {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}

      {staged.length > 0 && (
        <>
          <SectionTitle sub="Check what each sheet is and which column holds what. Required fields are marked; a constant applies one value to every row.">
            Check the mapping
          </SectionTitle>
          <div className="space-y-4">
            {staged.map((s, i) => (
              <StagedSheet key={s.sheet.id + i} s={s} tables={tables} registry={!willHaveWorkOrders}
                onChange={(p) => update(i, p)} onRemove={() => setStaged(staged.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div className="sticky bottom-4 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-panel/95 p-4 shadow-lg backdrop-blur">
            <p className="text-[13px] text-muted">
              {ready.length} of {staged.length} sheet(s) will be added.{" "}
              {!willHaveWorkOrders && "Without work orders the fleet runs in registry mode: the register, documents and compliance."}
            </p>
            <button onClick={addToFleet} disabled={!ready.length || busy || !ready.some((r) => r.table === "vehicles") && !workspace?.inputs.some((i) => i.table === "vehicles")}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
              <UploadSimple size={17} /> Add to my fleet and build
            </button>
          </div>
        </>
      )}

      <SectionTitle sub="Saved in this browser only. Re-importing a file with the same name and sheet replaces it.">My fleet data</SectionTitle>
      <Card>
        {workspace?.inputs.length ? (
          <>
            <table className="tnum w-full text-[13px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Source</th><th className="font-medium">Table</th><th className="text-right font-medium">Rows</th><th className="font-medium">Added</th><th /></tr></thead>
              <tbody>{workspace.inputs.map((inp) => (
                <tr key={inp.id} className="border-t border-border">
                  <td className="py-2">{inp.label}</td>
                  <td>{TABLE_LABEL[inp.table] ?? inp.table}</td>
                  <td className="text-right">{inp.rows.toLocaleString()}</td>
                  <td className="text-muted">{inp.added.slice(0, 10)}</td>
                  <td className="text-right">
                    <button onClick={() => removeInput(inp.id)} disabled={busy} aria-label={`Remove ${inp.label}`}
                      className="rounded-md p-1.5 text-faint transition hover:bg-panel-2 hover:text-bad"><Trash size={15} /></button>
                  </td>
                </tr>))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center gap-3">
              {!confirmClear ? (
                <button onClick={() => setConfirmClear(true)} className="text-[12.5px] text-muted hover:text-bad">Delete my fleet data from this browser…</button>
              ) : (
                <>
                  <span className="text-[12.5px] text-bad">This removes every imported sheet, scanned document and decode from this browser. It cannot be undone.</span>
                  <button className="rounded-lg bg-bad px-3 py-1.5 text-[12.5px] font-medium text-white" onClick={async () => {
                    const { clearWorkspace } = await import("@/lib/workspace");
                    await clearWorkspace();
                    location.reload();
                  }}>Delete</button>
                  <button className="text-[12.5px] text-muted" onClick={() => setConfirmClear(false)}>Cancel</button>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">Nothing imported yet. You are looking at the demo fleet.</p>
        )}
      </Card>
    </>
  );
}

function StagedSheet({ s, tables, registry, onChange, onRemove }: {
  s: Staged; tables: TableSpec[]; registry: boolean; onChange: (p: Partial<Staged>) => void; onRemove: () => void;
}) {
  const t = tables.find((x) => x.name === s.table);
  const sample = (header: string | null) => {
    if (!header) return "";
    if (header.startsWith("=")) return header.slice(1);
    const i = s.sheet.headers.indexOf(header);
    return s.sheet.rows.map((r) => r[i]).filter(Boolean).slice(0, 3).join(" · ");
  };
  const required = (c: { name: string; required: boolean }) =>
    registry ? s.table === "vehicles" && c.name === "vehicle_id" : c.required && !!t?.required;
  const missing = t ? t.columns.filter((c) => required(c) && !s.mapping[c.name]) : [];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{s.sheet.id}</p>
          <p className="text-[12.5px] text-muted">{s.sheet.rows.length.toLocaleString()} rows · {s.sheet.headers.length} columns</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={s.table ?? SKIP} onChange={(e) => {
            const table = e.target.value === SKIP ? null : e.target.value;
            const tt = tables.find((x) => x.name === table);
            onChange({ table, mapping: tt ? guessMapping(s.sheet.headers, tt) : {} });
          }} className="rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[13px]">
            <option value={SKIP}>Skip this sheet</option>
            {tables.map((x) => <option key={x.name} value={x.name}>{TABLE_LABEL[x.name] ?? x.name}</option>)}
          </select>
          <button onClick={onRemove} aria-label="Remove sheet" className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-bad"><Trash size={15} /></button>
        </div>
      </div>
      {t && (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px]" style={{ color: missing.length ? "var(--bad)" : "var(--good)" }}>
            {missing.length ? <WarningCircle size={15} weight="fill" /> : <CheckCircle size={15} weight="fill" />}
            {missing.length ? `Map the required: ${missing.map((c) => c.name).join(", ")}` : "Ready"}
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            {t.columns.map((c) => {
              const m = s.mapping[c.name];
              const isConst = !!m && m.startsWith("=");
              return (
                <div key={c.name} className="grid grid-cols-[150px_1fr] items-center gap-2 text-[12.5px]" title={c.description}>
                  <span className="truncate">
                    {c.name}{required(c) && <span className="text-bad"> *</span>}
                  </span>
                  <div className="min-w-0">
                    <div className="flex gap-1.5">
                      <select value={isConst ? CONST : m ?? ""} onChange={(e) => {
                        const v = e.target.value;
                        onChange({ mapping: { ...s.mapping, [c.name]: v === "" ? null : v === CONST ? "=" : v } });
                      }} className={`min-w-0 flex-1 rounded-md border px-2 py-1 ${m ? "border-border bg-panel" : "border-dashed border-border bg-transparent text-faint"}`}>
                        <option value="">— not supplied —</option>
                        {s.sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        <option value={CONST}>Same value for every row…</option>
                      </select>
                      {isConst && (
                        <input value={m!.slice(1)} placeholder="value" onChange={(e) => onChange({ mapping: { ...s.mapping, [c.name]: `=${e.target.value}` } })}
                          className="w-28 rounded-md border border-border bg-panel px-2 py-1" />
                      )}
                    </div>
                    {m && <p className="mt-0.5 truncate text-[11px] text-faint">{sample(m)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
