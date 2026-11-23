"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BASE, regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { usePanel } from "@/components/use-panel";
import { inlineMarkdown, markdown } from "@/lib/markdown";
import { isSopProgress, type SopProgress } from "@/lib/workspace";
import { parseSop, SOP_PAGES, sopProgressKey, sopSignal, type Sop, type SopSignal } from "@/lib/sops";

async function readContent(file: string) {
  const response = await fetch(BASE + "/content/" + file);
  if (!response.ok) throw new Error("Procedure content could not be loaded. Reconnect and retry.");
  return response.text();
}

export default function DoctrinePage() {
  const engine = useEngine(), panel = usePanel();
  const [content, setContent] = useState<{ doc: string; sops: Sop[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState("SOP-02");
  const [filter, setFilter] = useState("all"), [search, setSearch] = useState("");
  const w = regionWhere(engine.region, "AND");
  const counts = useSql<{ id: string; n: number }>(
    "SELECT 'SOP-03' AS id, count(*) AS n FROM mart_site_weekly WHERE status = 'INTERVENE' AND wk = (SELECT max(wk) FROM mart_site_weekly)" + w +
    " UNION ALL SELECT 'SOP-04', count(*) FROM mart_recall_completion WHERE days_since_launch >= 56 AND completion_pct < (SELECT green FROM cfg_targets WHERE kpi = 'recall_completion_pct')" + w +
    " UNION ALL SELECT 'SOP-05', coalesce(sum(overdue), 0) FROM mart_pm_compliance WHERE TRUE" + w +
    " UNION ALL SELECT 'SOP-06', count(*) FROM mart_cost_monthly WHERE cost_vs_budget_pct > 0 AND month_start = (SELECT max(month_start) FROM mart_cost_monthly)" + w +
    " UNION ALL SELECT 'SOP-07', coalesce(sum(vehicles), 0) FROM mart_compliance_status WHERE status IN ('Expired', 'Expiring', 'Missing', 'Unknown')" + w +
    " UNION ALL SELECT 'SOP-08', count(*) FROM mart_job_outcomes WHERE is_low AND month_start = (SELECT max(month_start) FROM mart_metric_panel)" + w
  );
  useEffect(() => {
    let live = true;
    Promise.all([readContent("DOCTRINE.md"), readContent("sops.json").then(async (text) => {
      const files: unknown = JSON.parse(text);
      if (!Array.isArray(files) || !files.every((f) => typeof f === "string" && /^SOP-\d{2}-[a-z0-9-]+\.md$/.test(f))) throw new Error("Procedure index is invalid.");
      return Promise.all(files.map(async (file: string) => parseSop(file, await readContent(file))));
    })]).then(([doc, sops]) => { if (live) {
      setContent({ doc: markdown(doc), sops }); setError(null);
      const id = window.location.hash.slice(1);
      if (/^SOP-\d{2}$/.test(id)) setSelected(id);
    } })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [retry]);
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1);
      if (/^SOP-\d{2}$/.test(id)) setSelected(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const evidence = engine.status === "ready" && counts.data ? {
    ...Object.fromEntries(counts.data.map((r) => [r.id, r.n])),
    "SOP-09": engine.workspace?.garage ? engine.workspace.garage.incidents.filter((incident) => !incident.resolvedAt).length : null,
  } : null;
  const signal = (id: string) => sopSignal(id, engine.log, evidence, panel.last?.v ?? {}, panel.targets);
  const active = content?.sops.filter((s) => signal(s.meta.id).state === "active").length ?? 0;
  const chosen = content?.sops.find((s) => s.meta.id === selected);
  const visible = content?.sops.filter((s) => (filter === "all" || signal(s.meta.id).state === filter) &&
    (s.meta.id + " " + s.meta.title + " " + s.meta.owner).toLowerCase().includes(search.toLowerCase()));
  const key = chosen ? sopProgressKey(engine.dataset, engine.workspace?.name ?? "Demo", engine.region, engine.log?.snapshot ?? "", chosen) : "";
  const scope = (engine.dataset === "demo" ? "Demo fleet" : engine.workspace?.name ?? "My fleet") + " / " + (engine.region ?? "All regions") + " / " + (engine.log?.snapshot.slice(0, 10) ?? "No snapshot");
  return <>
    <PageHeader art="doctrine" eyebrow="Operating system" title="From signal to action">Run the playbook, record the evidence, and give every exception an owner. Procedures follow the selected region and loaded report.</PageHeader>
    <div className="ops-banner mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="text-[14px] font-semibold">{evidence ? active + " procedures need attention" : "Checking operational evidence"}</p><p className="mt-1 text-[13px] text-muted">{scope}</p></div>
      <Link href="/network/" className="ops-button">Explore metric network</Link>
    </div>
    {counts.error && <p role="alert" className="mb-4 text-sm text-bad">Trigger evidence could not be loaded. Check Pipeline &amp; your data. {counts.error}</p>}
    {error ? <Card><p role="alert">{error}</p><button onClick={() => setRetry((n) => n + 1)} className="ops-button mt-3">Retry loading procedures</button></Card> :
      !content ? <Skeleton height={560} /> : <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label="Procedure queue">
          <label className="text-[13px] font-medium" htmlFor="sop-search">Find a procedure</label>
          <input id="sop-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, owner or SOP number" className="ops-input mb-3 mt-2" />
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter procedures">{[["all", "All"], ["active", "Needs attention"], ["routine", "Routine"]].map(([id, label]) =>
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={"ops-chip " + (filter === id ? "ops-chip-active" : "")}>{label}</button>)}</div>
          <div className="space-y-2">{visible?.map((s) => {
            const live = signal(s.meta.id);
            return <button key={s.meta.id} onClick={() => { setSelected(s.meta.id); window.history.replaceState(null, "", "#" + s.meta.id); }}
              aria-pressed={selected === s.meta.id} className={"sop-row w-full text-left " + (selected === s.meta.id ? "sop-row-selected" : "")}>
              <span className="flex items-center justify-between gap-3 text-[12px]"><span className="font-semibold text-accent-ink">{s.meta.id}</span>
                <span className={live.state === "active" ? "text-warn" : "text-muted"}>{live.state === "active" ? "Needs attention" : live.state === "unknown" ? "Check evidence" : "Routine"}</span></span>
              <span className="mt-2 block text-[14px] font-semibold">{s.meta.title}</span><span className="mt-1 block text-[12px] text-muted">{s.meta.owner}</span>
            </button>;
          })}{!visible?.length && <p className="p-4 text-sm text-muted">No procedures match. Clear the search or select All.</p>}</div>
        </section>
        {chosen && (engine.status !== "ready" ? <Skeleton height={560} /> : <Procedure key={key} sop={chosen} signal={signal(chosen.meta.id)} storageKey={key} scope={scope} />)}
      </div>}
    {content && <details className="card mt-8 p-5"><summary className="cursor-pointer text-[16px] font-semibold">Read the Three Clocks Doctrine</summary>
      <article className="prose-doc mt-6 max-w-4xl" dangerouslySetInnerHTML={{ __html: content.doc }} /></details>}
  </>;
}

type Progress = SopProgress;
const empty = (): Progress => ({ checked: [], owner: "", due: "", notes: "" });
/** Demo practice stays in this tab's memory and never mixes with the owner's (encrypted) workspace. */
const practice = new Map<string, Progress>();
function Procedure({ sop, signal, storageKey, scope }: { sop: Sop; signal: SopSignal; storageKey: string; scope: string }) {
  const { dataset, workspace, updateSop } = useEngine();
  const demo = dataset === "demo";
  const [progress, setProgress] = useState<Progress>(() => {
    const v = demo ? practice.get(storageKey) : workspace?.sops?.[storageKey];
    return isSopProgress(v) ? v : empty();
  });
  const [saveError, setSaveError] = useState(false), [saved, setSaved] = useState(false);
  // Typing re-seals the whole workspace, so keystrokes are batched into one save; a pending save is flushed, never
  // dropped, if the procedure closes first.
  const pending = useRef<(() => void) | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; const run = pending.current; pending.current = null; run?.(); };
  useEffect(() => flush, []);
  const update = (next: Progress) => {
    setProgress(next);
    if (demo) { practice.set(storageKey, next); setSaved(true); return; }
    if (timer.current) clearTimeout(timer.current);
    pending.current = () => { updateSop(storageKey, next).then(() => { setSaved(true); setSaveError(false); }, () => setSaveError(true)); };
    timer.current = setTimeout(flush, 500);
  };
  const done = sop.steps.filter((_, i) => progress.checked.includes(i)).length;
  const page = SOP_PAGES[sop.meta.id];
  const today = new Date(), localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const overdue = progress.due && progress.due < localDate && done < sop.steps.length;
  const download = () => {
    const text = ["# " + sop.meta.id + ": " + sop.meta.title, "", "Scope: " + scope, "Exported: " + new Date().toISOString(),
      "Signal: " + signal.reason, "Owner: " + (progress.owner || "Unassigned"), "Due: " + (progress.due || "Not set"), "",
      ...sop.steps.map((step, i) => "- [" + (progress.checked.includes(i) ? "x" : " ") + "] " + step),
      "", "## Evidence and handoff notes", progress.notes || "No notes recorded.", "", sop.guidance].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = sop.meta.id + "-review.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Card className="min-w-0 p-5 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-accent-ink">{sop.meta.id}</p><h2 className="mt-1 text-[23px] font-semibold">{sop.meta.title}</h2></div>
      {page && <Link href={page.href} className="ops-button">{page.label}</Link>}</div>
    <p className={"mt-4 rounded-lg border p-3 text-[13px] " + (signal.state === "active" ? "border-warn/40 bg-warn/5" : "border-border bg-panel-2")}>{signal.reason}</p>
    <dl className="mt-5 grid gap-4 text-[13px] sm:grid-cols-2">
      <div><dt className="text-muted">Accountable role</dt><dd className="mt-1 font-medium">{sop.meta.owner}</dd></div>
      <div><dt className="text-muted">Cadence</dt><dd className="mt-1 font-medium">{sop.meta.cadence}</dd></div>
      <div className="sm:col-span-2"><dt className="text-muted">Trigger</dt><dd className="mt-1">{sop.meta.trigger}</dd></div>
    </dl>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <label className="text-[13px] font-medium">Named owner<input className="ops-input mt-2" placeholder="Assign a person" value={progress.owner} onChange={(e) => update({ ...progress, owner: e.target.value })} /></label>
      <label className="text-[13px] font-medium">Review due<input className="ops-input mt-2" type="date" value={progress.due} onChange={(e) => update({ ...progress, due: e.target.value })} /></label>
    </div>
    {overdue && <p className="mt-3 text-sm text-bad">Review overdue. Confirm the next action with the owner.</p>}
    <div className="mt-6 flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold">Execution checklist</h3><span className="tnum text-[13px] text-muted">{done} / {sop.steps.length}</span></div>
    <progress aria-label="Checklist completion" max={sop.steps.length || 1} value={done} className="mt-3 h-1.5 w-full accent-[var(--accent)]" />
    <ol className="mt-3 divide-y divide-border">{sop.steps.map((step, i) => <li key={i}><label className="flex cursor-pointer items-start gap-3 py-3 text-[14px] leading-relaxed">
      <input type="checkbox" checked={progress.checked.includes(i)} onChange={(e) => update({ ...progress, checked: e.target.checked ? [...progress.checked, i] : progress.checked.filter((n) => n !== i) })} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span className={progress.checked.includes(i) ? "text-muted" : ""} dangerouslySetInnerHTML={{ __html: inlineMarkdown(step) }} /></label></li>)}</ol>
    {done === sop.steps.length && done > 0 && <p role="status" className="mt-3 text-sm text-good">Checklist ready for review. Verify the exit criteria below; live flags remain until the source evidence changes.</p>}
    <label className="mt-5 block text-[13px] font-medium">Evidence and handoff notes<textarea value={progress.notes} onChange={(e) => update({ ...progress, notes: e.target.value })}
      placeholder="Root cause, work-order references, agreed action, evidence of recovery…" className="ops-input mt-2 min-h-28 resize-y" /></label>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className={"text-[12px] " + (saveError ? "text-bad" : "text-muted")}>{saveError ? "Changes are not saved. Download the review before leaving." : demo ? "Demo practice: kept until this tab reloads." : saved ? "Saved with this fleet in this browser (encrypted if a passphrase is set)." : "Progress is saved with this fleet in this browser. Download a review for handoff."}</p>
      <button onClick={download} className="ops-button">Download review</button>
    </div>
    <article className="prose-doc mt-6 border-t border-border pt-4" dangerouslySetInnerHTML={{ __html: markdown(sop.guidance) }} />
  </Card>;
}

