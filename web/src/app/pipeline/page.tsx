"use client";

import Link from "next/link";
import { WorkTree } from "@/components/work-tree";
import { Pull } from "@/components/bits/fleetops-bits";
import { CheckCircle, UploadSimple, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Chart } from "@/components/chart";
import { useEngine } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";

const LAYER_COLOR: Record<string, string> = { source: "#CBD5E1", staging: "#94A3B8", intermediate: "#A5B4FC", marts: "#6366F1" };

export default function PipelinePage() {
  const { log, runDemo, runMine, dataset, workspace, status } = useEngine();
  const busy = status === "running" || status === "booting";

  return (
    <>
      <PageHeader art="pipeline" backdrop eyebrow="Govern" title="The pipeline, running in your browser">
        The same SQL files as the Python package (<code>fleetkpi build</code>), executed by DuckDB-WASM on this page: ingest, settings,
        validation rules, staging → intermediate → marts, then data tests. Import your own fleet to run it on yours; nothing is uploaded anywhere.
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

        <Card title="Run it on your fleet" sub="Import your vehicle list, registration cards and service history; the same pipeline runs on them here, in your browser.">
          <div className="flex flex-col gap-2">
            <Pull block><Link href="/import/" className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[14px] font-medium text-white transition hover:opacity-90 active:scale-[0.98]">
              <UploadSimple size={18} /> Import your fleet (Excel, CSV)
            </Link></Pull>
            <Link href="/documents/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13.5px] text-muted transition hover:text-text">
              Scan registration cards and policies
            </Link>
            <div className="mt-1 flex gap-2">
              <button onClick={() => runDemo()} disabled={busy || dataset === "demo"}
                className="flex-1 rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted transition hover:text-text active:scale-95 disabled:opacity-40">
                Show the demo fleet
              </button>
              <button onClick={() => runMine()} disabled={busy || dataset === "mine" || !workspace?.inputs.length}
                className="flex-1 rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted transition hover:text-text active:scale-95 disabled:opacity-40">
                Show my fleet
              </button>
            </div>
          </div>
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
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead className="text-left text-faint"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th className="!pl-0">Rule</th><th>Table</th><th>Check</th><th className="text-right">Rows</th><th className="!pr-0">Examples</th></tr></thead>
              <tbody>{log.issues.map((i) => (
                <tr key={i.rule} className="border-t border-border align-top [&>td]:px-3 [&>td]:py-2">
                  <td className="!pl-0 font-mono text-[11.5px]"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: i.severity === "error" ? "var(--bad)" : "var(--warn)" }} />{i.rule}</td>
                  <td>{i.table}</td><td className="text-muted">{i.check}</td><td className="tnum text-right">{i.count}</td><td className="!pr-0 text-muted">{i.example}</td>
                </tr>))}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}

      <SectionTitle sub="How your files become the pages you use. Every count below comes from this browser's run; click an output to open it.">Work tree</SectionTitle>
      <div className="card overflow-hidden !border-0 !bg-transparent">{log?.models.length ? <WorkTree log={log} /> : <Skeleton height={480} />}</div>

      <SectionTitle sub="Every model and the tables it reads, discovered from its FROM / JOIN clauses. Hover to trace.">Lineage</SectionTitle>
      <Card className="diagram-canvas">{log?.models.length ? <Lineage log={log} /> : <Skeleton height={520} />}</Card>

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
        emphasis: { focus: "adjacency", lineStyle: { width: 2, opacity: 1 }, label: { color: dark ? "#e8eaf3" : "#0f1222", fontWeight: 600 } },
        data: placed.map((n) => ({ id: n.id, name: n.id, x: n.x, y: n.y, symbolSize: 8,
          itemStyle: { color: LAYER_COLOR[n.layer] }, label: { position: n.layer === "source" ? "left" : "right" } })),
        links: log.models.flatMap((m) => [...m.deps, ...m.sources].map((d) => ({ source: d, target: m.name }))),
        lineStyle: { color: dark ? "#3a4160" : "#cfd4e4", width: 0.8, opacity: 0.7, curveness: 0.15 },
      }],
    })} />
  );
}
