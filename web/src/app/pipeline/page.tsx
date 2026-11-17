"use client";

import { useState } from "react";
import { CheckCircle, DownloadSimple, UploadSimple, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import { useEngine } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";

const LAYER_COLOR: Record<string, string> = { source: "#94A3B8", staging: "#06B6D4", intermediate: "#6366F1", marts: "#10B981" };

function template(name: string, cols: { name: string }[]) {
  const blob = new Blob([cols.map((c) => c.name).join(",") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PipelinePage() {
  const { log, engine, runFiles, runDemo, status } = useEngine();
  const [drag, setDrag] = useState(false);
  const busy = status === "running" || status === "booting";
  const onFiles = (fl: FileList | null) => fl && fl.length && runFiles([...fl]);

  return (
    <>
      <PageHeader eyebrow="Govern" title="The pipeline, running in your browser">
        The same SQL files as the Python package (<code>fleetkpi build</code>), executed by DuckDB-WASM on this page: ingest, settings,
        validation rules, staging → intermediate → marts, then data tests. Drop your own fleet&apos;s files to run it on them; nothing is uploaded anywhere.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Stages" sub={log ? `${log.dataset} · snapshot ${log.snapshot.slice(0, 10) || "–"} · ${(log.totalMs / 1000).toFixed(2)} s total` : "Starting…"}>
          {log ? (
            <ol className="space-y-2">
              {log.stages.map((s, i) => {
                const Icon = s.status === "ok" ? CheckCircle : s.status === "warn" ? WarningCircle : XCircle;
                const c = s.status === "ok" ? "var(--good)" : s.status === "warn" ? "var(--warn)" : "var(--bad)";
                return (
                  <li key={s.name} className="flex items-start gap-3 rounded-xl border border-border bg-panel-2 px-3 py-2.5">
                    <Icon size={20} weight="fill" style={{ color: c }} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{i + 1}. {s.name}</p>
                      <p className="text-[12.5px] text-muted">{s.detail}</p>
                    </div>
                    <span className="tnum text-[12px] text-faint">{s.ms < 1000 ? `${s.ms.toFixed(0)} ms` : `${(s.ms / 1000).toFixed(2)} s`}</span>
                  </li>
                );
              })}
            </ol>
          ) : <Skeleton />}
        </Card>

        <Card title="Run it on your fleet" sub="CSV, Parquet or JSON; one file per table, named like the table (vehicles.csv…). Column names are matched by 300+ synonyms.">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${drag ? "border-accent bg-accent-soft" : "border-border hover:border-accent"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <UploadSimple size={26} className="text-accent" />
            <span className="text-[14px] font-medium">Drop files here or click to choose</span>
            <span className="text-[12px] text-muted">Required: sites, vehicles, work_orders, usage</span>
            <input type="file" multiple accept=".csv,.parquet,.json" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => runDemo()} disabled={busy}
              className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted transition hover:text-text active:scale-95 disabled:opacity-50">
              Back to the demo fleet
            </button>
          </div>
          {engine && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Blank templates</p>
              <div className="flex flex-wrap gap-1.5">
                {engine.manifest.tables.map((t) => (
                  <button key={t.name} onClick={() => template(t.name, t.columns)} title={t.description}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted transition hover:border-accent hover:text-accent">
                    <DownloadSimple size={12} /> {t.name}{t.required ? "" : " (optional)"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {log && log.loads.some((l) => l.source && Object.keys(l.mapped).length) && (
        <>
          <SectionTitle sub="How your columns were matched to the data contract.">Column mapping</SectionTitle>
          <Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {log.loads.filter((l) => l.source).map((l) => (
                <div key={l.table} className="rounded-xl border border-border p-3 text-[12.5px]">
                  <p className="font-medium">{l.table} <span className="text-faint">· {l.rows.toLocaleString()} rows from {l.source}</span></p>
                  {l.missingRequired.length > 0 && <p className="mt-1 text-bad">Missing: {l.missingRequired.join(", ")}</p>}
                  <ul className="mt-1.5 space-y-0.5 text-muted">
                    {Object.entries(l.mapped).map(([k, v]) => <li key={k}><code>{v}</code> → {k}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {log && log.issues.length > 0 && (
        <>
          <SectionTitle sub="Validation rules that found rows to fix. Errors block the build; warnings do not.">Data quality</SectionTitle>
          <Card>
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Rule</th><th className="font-medium">Table</th><th className="font-medium">Check</th><th className="text-right font-medium">Rows</th><th className="font-medium">Examples</th></tr></thead>
              <tbody>{log.issues.map((i) => (
                <tr key={i.rule} className="border-t border-border">
                  <td className="py-1.5" style={{ color: i.severity === "error" ? "var(--bad)" : "var(--warn)" }}>{i.rule}</td>
                  <td>{i.table}</td><td className="text-muted">{i.check}</td><td className="tnum text-right">{i.count}</td><td className="text-muted">{i.example}</td>
                </tr>))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <SectionTitle sub="Every model and the tables it reads, discovered from its FROM / JOIN clauses. Hover to trace.">Lineage</SectionTitle>
      <Card>{log?.models.length ? <Lineage log={log} /> : <Skeleton height={520} />}</Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Models" sub="Rows produced and time taken, in this browser">
          {log?.models.length ? (
            <div className="max-h-[440px] overflow-auto">
              <table className="tnum w-full text-[12.5px]">
                <thead className="sticky top-0 bg-panel text-left text-faint"><tr><th className="py-1 font-medium">Model</th><th className="font-medium">Layer</th><th className="text-right font-medium">Rows</th><th className="text-right font-medium">ms</th></tr></thead>
                <tbody>{log.models.map((m) => (
                  <tr key={m.name} className="border-t border-border" title={m.description}>
                    <td className="py-1.5"><code>{m.name}</code><div className="text-[11px] text-faint">{m.description}</div></td>
                    <td><span className="rounded-full px-2 py-0.5 text-[11px]" style={{ color: LAYER_COLOR[m.layer], background: `color-mix(in srgb, ${LAYER_COLOR[m.layer]} 14%, transparent)` }}>{m.layer}</span></td>
                    <td className="text-right">{m.rows.toLocaleString()}</td>
                    <td className="text-right text-muted">{m.ms.toFixed(0)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ) : <Skeleton />}
        </Card>
        <Card title="SQL tests" sub="Assertions on the models; a test passes when its query returns no rows">
          {log?.tests.length ? (
            <ul className="max-h-[440px] space-y-1.5 overflow-auto">
              {log.tests.map((t) => (
                <li key={t.name} className="flex items-start gap-2 text-[12.5px]">
                  {t.status === "pass" ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-good" /> : <XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-bad" />}
                  <span><code>{t.name}</code><span className="block text-muted">{t.description}</span></span>
                </li>
              ))}
            </ul>
          ) : <Skeleton />}
        </Card>
      </div>
    </>
  );
}

function Lineage({ log }: { log: NonNullable<ReturnType<typeof useEngine>["log"]> }) {
  const layers = ["source", "staging", "intermediate", "marts"];
  const sources = [...new Set(log.models.flatMap((m) => m.sources))].sort();
  const nodes = [
    ...sources.map((s) => ({ id: s, layer: "source" })),
    ...log.models.map((m) => ({ id: m.name, layer: m.layer })),
  ];
  const byLayer = layers.map((l) => nodes.filter((n) => n.layer === l));
  const placed = byLayer.flatMap((group, li) =>
    group.map((n, i) => ({ ...n, x: li * 300, y: (i - (group.length - 1) / 2) * 22 })));
  const height = Math.max(...byLayer.map((g) => g.length)) * 22 + 40;
  return (
    <Chart height={Math.min(height, 900)} option={(dark) => ({
      tooltip: { formatter: (x: unknown) => (x as { name?: string }).name ?? "" },
      series: [{
        type: "graph", layout: "none", roam: false, left: 150, right: 190, top: 16, bottom: 16, edgeSymbol: ["none", "arrow"], edgeSymbolSize: 5,
        label: { show: true, fontSize: 10, color: dark ? "#9097b0" : "#5b6178", position: "right" },
        emphasis: { focus: "adjacency", lineStyle: { width: 2.5, opacity: 1 }, label: { color: dark ? "#e8eaf3" : "#0f1222", fontWeight: 600 } },
        data: placed.map((n) => ({ id: n.id, name: n.id, x: n.x, y: n.y, symbolSize: 8,
          itemStyle: { color: LAYER_COLOR[n.layer] }, label: { position: n.layer === "source" ? "left" : "right" } })),
        links: log.models.flatMap((m) => [...m.deps, ...m.sources].map((d) => ({ source: d, target: m.name }))),
        lineStyle: { color: dark ? "#3a4160" : "#cfd4e4", width: 0.8, opacity: 0.7, curveness: 0.15 },
      }],
    })} />
  );
}
