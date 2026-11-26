"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BASE, regionWhere, useEngine, useSql } from "@/components/engine-provider";
import { Circle, Square } from "@phosphor-icons/react";
import { Card, Skeleton } from "@/components/ui";
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
  const evidence = (engine.status === "ready" || !!engine.preview) && counts.data ? {
    ...Object.fromEntries(counts.data.map((r) => [r.id, r.n])),
    "SOP-09": engine.workspace?.garage ? engine.workspace.garage.incidents.filter((incident) => !incident.resolvedAt).length : null,
  } : null;
  const signal = (id: string) => sopSignal(id, engine.log, evidence, panel.last?.v ?? {}, panel.targets);
  const active = content?.sops.filter((s) => signal(s.meta.id).state === "active").length ?? 0;
  const chosen = content?.sops.find((s) => s.meta.id === selected);
  const visible = content?.sops.filter((s) => (filter === "all" || signal(s.meta.id).state === filter) &&
    (s.meta.id + " " + s.meta.title + " " + s.meta.owner).toLowerCase().includes(search.toLowerCase()));
  const key = chosen ? sopProgressKey(engine.dataset, engine.workspace?.name ?? "Demo", engine.region, engine.log?.snapshot ?? "", chosen) : "";
  const snapshot = engine.log?.snapshot.slice(0, 10) ?? "";
  const scope = [engine.dataset === "demo" ? "Demo fleet" : engine.workspace?.name ?? "My fleet", engine.region ?? "All regions", snapshot || "No snapshot"].join(" / ");
  const total = content?.sops.length ?? 0;
  return <div className="sop-page">
    <header className="sop-head">
      <h1>Procedures</h1>
      <p>{evidence && total ? <><strong>{active} of {total} need attention.</strong> </> : "Checking the evidence. "}
        {engine.dataset === "demo" ? "Demo fleet" : engine.workspace?.name ?? "My fleet"}, {(engine.region ?? "All regions").toLowerCase() === "all regions" ? "all regions" : engine.region}{snapshot ? <>, data to <time dateTime={snapshot}>{snapshot}</time></> : null}. <Link href="/network/">See the metrics behind them</Link></p>
      <Link className="ops-button mt-3 inline-flex" href="/ehs/#ehs-procedure">EHS incident response SOP</Link>
    </header>
    {counts.error && <p role="alert" className="mb-4 text-sm text-bad">Trigger evidence could not be loaded. Check Pipeline &amp; your data. {counts.error}</p>}
    {error ? <Card><p role="alert">{error}</p><button onClick={() => setRetry((n) => n + 1)} className="ops-button mt-3">Retry loading procedures</button></Card> :
      !content ? <Skeleton height={560} /> : <div className="sop-layout">
        <section aria-label="Procedure list" className="sop-index">
          <label className="sr-only" htmlFor="sop-search">Find a procedure</label>
          <input id="sop-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, owner or number" className="sop-search" />
          <div className="sop-tabs" role="group" aria-label="Filter procedures">{[["all", "All"], ["active", "Attention"], ["routine", "Routine"]].map(([id, label]) =>
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
          <ul>{visible?.map((s) => {
            const live = signal(s.meta.id), on = selected === s.meta.id;
            return <li key={s.meta.id}><button aria-pressed={on} onClick={() => { setSelected(s.meta.id); window.history.replaceState(null, "", "#" + s.meta.id); showOnNarrow(); }}>
              <span className="sop-no">{s.meta.id.replace("SOP-", "")}</span>
              <span className="min-w-0"><b>{s.meta.title}</b><small>{s.meta.owner}</small></span>
              <State state={live.state} short />
            </button></li>;
          })}</ul>
          {!visible?.length && <p className="py-4 text-sm text-muted">No procedures match. Clear the search or choose All.</p>}
        </section>
        {chosen && (engine.status !== "ready" && !engine.preview ? <Skeleton height={560} /> : <Procedure key={key} sop={chosen} signal={signal(chosen.meta.id)} storageKey={key} scope={scope} />)}
      </div>}
    {content && <details className="sop-doctrine"><summary>Read the Three Clocks Doctrine</summary>
      <article className="prose-doc mt-6 max-w-4xl" dangerouslySetInnerHTML={{ __html: content.doc }} /></details>}
  </div>;
}

/** One column on narrow screens: bring the chosen procedure into view instead of leaving it below the list. */
function showOnNarrow() {
  if (matchMedia("(min-width: 1100px)").matches) return;
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(".sop-doc")?.scrollIntoView({ block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })));
}

const WORD = { active: "Needs attention", unknown: "Check evidence", routine: "Routine" } as const;
/** A shape and a word, so the state never rests on colour. */
function State({ state, short = false }: { state: SopSignal["state"]; short?: boolean }) {
  const Icon = state === "active" ? Square : Circle;
  return <span className="sop-state" data-state={state}><Icon size={9} weight={state === "routine" ? "regular" : "fill"} aria-hidden />
    <span className={short && state === "routine" ? "sr-only" : ""}>{short && state === "active" ? "Attention" : short && state === "unknown" ? "Check" : WORD[state]}</span></span>;
}

/** "## Purpose\n…" becomes { Purpose: "…" }, so the page can place each part where it is read. */
function sections(guidance: string): [string, string][] {
  return guidance.split(/^## /m).slice(1).map((part) => {
    const end = part.indexOf("\n");
    return [part.slice(0, end < 0 ? undefined : end).trim(), end < 0 ? "" : part.slice(end + 1).trim()];
  });
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
  const parts = sections(sop.guidance);
  const purpose = parts.find(([name]) => name === "Purpose")?.[1];
  return <article className="sop-doc">
    <header>
      <p className="sop-no">{sop.meta.id}</p>
      <h2>{sop.meta.title}</h2>
      {purpose && <div className="sop-purpose" dangerouslySetInnerHTML={{ __html: markdown(purpose) }} />}
    </header>
    <p className="sop-signal"><State state={signal.state} /> <span>{signal.reason}</span>{page && <Link href={page.href}>{page.label}</Link>}</p>
    <dl className="sop-facts">
      <div><dt>Accountable</dt><dd>{sop.meta.owner}</dd></div>
      <div><dt>When</dt><dd>{sop.meta.cadence}</dd></div>
      {sop.meta.trigger !== "Weekly" && <div><dt>Trigger</dt><dd>{sop.meta.trigger}</dd></div>}
      <div><dt><label htmlFor="sop-owner">Owner this time</label></dt><dd><input id="sop-owner" placeholder="Add a name" value={progress.owner} onChange={(e) => update({ ...progress, owner: e.target.value })} /></dd></div>
      <div><dt><label htmlFor="sop-due">Due</label></dt><dd><input id="sop-due" type="date" value={progress.due} onChange={(e) => update({ ...progress, due: e.target.value })} /></dd></div>
    </dl>
    {overdue && <p className="mt-3 text-sm text-bad">Review overdue. Confirm the next action with the owner.</p>}
    <section>
      <h3>Steps <span className="tnum">{done} of {sop.steps.length} done</span></h3>
      <ol className="sop-steps">{sop.steps.map((step, i) => { const on = progress.checked.includes(i); return <li key={i} data-done={on || undefined}><label>
        <input type="checkbox" checked={on} onChange={(e) => update({ ...progress, checked: e.target.checked ? [...progress.checked, i] : progress.checked.filter((n) => n !== i) })} />
        <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(step) }} /></label></li>; })}</ol>
      {done === sop.steps.length && done > 0 && <p role="status" className="mt-3 text-sm text-good">All steps done. Check the exit criteria; live flags stay until the source evidence changes.</p>}
    </section>
    <section>
      <h3><label htmlFor="sop-notes">Evidence and handoff notes</label></h3>
      <textarea id="sop-notes" value={progress.notes} onChange={(e) => update({ ...progress, notes: e.target.value })} placeholder="Cause, work orders, agreed action, proof it worked" />
      <div className="sop-foot">
        <p role="status" className={saveError ? "text-bad" : ""}>{saveError ? "Changes are not saved. Download the review before leaving." : demo ? "Demo practice, kept until this tab reloads." : saved ? "Saved with this fleet in this browser (encrypted if a passphrase is set)." : "Saved with this fleet in this browser as you type."}</p>
        <button onClick={download} className="sop-primary">Download review</button>
      </div>
    </section>
    {parts.filter(([name]) => name !== "Purpose").map(([name, text]) => <section key={name}><h3>{name}</h3><div className="prose-doc" dangerouslySetInnerHTML={{ __html: markdown(text) }} /></section>)}
  </article>;
}
