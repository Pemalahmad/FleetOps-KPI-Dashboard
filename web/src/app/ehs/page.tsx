"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useEngine } from "@/components/engine-provider";
import { useGarageOperations } from "@/components/garage/use-garage";
import { useTeam } from "@/components/team-provider";
import { ehsSource, TEAM_STAGES } from "@/lib/team-cases";
import { TeamCaseLink } from "@/components/team-case-sync";
import { Card } from "@/components/ui";
import { localDate } from "@/lib/garage";
import {
  EHS_CATEGORIES, EHS_COUNTRIES, EHS_PRIORITY, EHS_STAGES, nextEhsStage, reportEhsCase, updateEhsCase,
  type EhsCase, type EhsReport, type EhsStage, type EhsUpdate,
} from "@/lib/ehs";

const FIELD = "min-h-11 w-full rounded-lg border border-border bg-panel px-3 py-2 text-text";
const LABEL = "grid gap-1 text-sm text-muted";
const SOP = [
  ["Make the scene safe", "Stop work or vehicle use when there is danger. Warn others, follow the site emergency plan and contact local emergency services when needed. Leave hazardous response to trained responders."],
  ["Report and escalate", "Log the event, severity, location and facts. Contact the role in the escalation table and record who received the report, when and how. Assign a case owner, accountable manager and follow-up."],
  ["Contain and investigate", "Record who isolated the hazard and how, preserve references to relevant evidence, and identify the causes with the people involved. Ask the local EHS lead to confirm authority, insurer and site reporting obligations."],
  ["Correct and verify", "Assign a corrective action and record its evidence. A different reviewer verifies the action works, confirms reporting is resolved and records the closure evidence before operations resume."],
] as const;

const STANDARDS = [
  ["ISO 45001 · Occupational health and safety", "Assess risks, involve workers, maintain emergency plans and investigate incidents.", "https://www.iso.org/standard/45001"],
  ["ISO 14001 · Environmental management", "Identify environmental impacts and maintain controls for spills, waste and hazardous materials.", "https://www.iso.org/standard/14001"],
  ["ISO 39001 · Road traffic safety", "Manage fleet risks including driver fitness, vehicle condition, exposure and collision response.", "https://www.iso.org/standard/44958.html"],
  ["ILO-OSH 2001 · Investigation and corrective action", "Document causes, corrective actions and management follow-up with worker participation.", "https://www.ilo.org/topics/safety-and-health-work/occupational-safety-and-health-ilo-areas-work/occupational-safety-and-health-management-systems"],
] as const;

const readField = (form: FormData, field: string) => String(form.get(field) ?? "");
const dateTime = (date: string) => new Date(date).toLocaleString();
type Change = ReturnType<typeof useGarageOperations>["change"];

function CaseReport({ change, saving, done }: { change: Change; saving: boolean; done: (id: string) => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = crypto.randomUUID();
    const report = {
      country: readField(form, "country"), category: readField(form, "category"), priority: readField(form, "priority"),
      site: readField(form, "site"), vehicle: readField(form, "vehicle"), summary: readField(form, "summary"),
      reporter: readField(form, "reporter"), occurredAt: readField(form, "occurredAt"),
    } as EhsReport;
    if (await change((state) => reportEhsCase(state, report, id))) done(id);
  };
  return <form aria-label="Report EHS incident" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <label className={LABEL}>Country<select name="country" className={FIELD} required defaultValue=""><option value="" disabled>Select country</option>{EHS_COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></label>
    <label className={LABEL}>Site or location<input name="site" className={FIELD} required maxLength={120} /></label>
    <label className={LABEL}>Category<select name="category" required className={FIELD}>{EHS_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label className={LABEL}>Severity<select name="priority" required className={FIELD} defaultValue=""><option value="" disabled>Select severity</option>{Object.entries(EHS_PRIORITY).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
    <label className={LABEL}>Incident time (local)<input name="occurredAt" type="datetime-local" required className={FIELD} /></label>
    <label className={LABEL}>Vehicle or work order reference<input name="vehicle" className={FIELD} maxLength={80} /></label>
    <label className={LABEL}>Reported by<input name="reporter" className={FIELD} maxLength={80} required /></label>
    <label className={LABEL}>What happened<textarea name="summary" className={FIELD} maxLength={600} required /></label>
    <div className="sm:col-span-2"><button className="ops-button" disabled={saving}>File incident report</button></div>
  </form>;
}

function CaseDetail({ item, change, saving, close, linked }: { item: EhsCase; change: Change; saving: boolean; close: () => void; linked?: string }) {
  const team = useTeam();
  const shared = linked && team.teamId === linked ? team.cases.find((record) => record.source_key === ehsSource(item)) : undefined;
  const next = shared ? null : nextEhsStage(item.stage);
  const action: Partial<Record<EhsStage, string>> = {
    escalated: "Record escalation", contained: "Record containment", corrective: "Record corrective action", closed: "Verify and close",
  };
  const hints: Partial<Record<EhsStage, string>> = {
    escalated: "Record who was contacted, when and how.",
    contained: "Record the controls in place and the evidence that the danger is contained.",
    corrective: "Record the identified causes, corrective action, owner and evidence reference.",
    closed: "Enter the independent review findings and evidence reference. Complete the external reporting decision.",
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const advance = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "advance";
    const update = {
      owner: readField(form, "owner"), manager: readField(form, "manager"), due: readField(form, "due"),
      actor: readField(form, "actor"), detail: readField(form, "detail"),
      notification: readField(form, "notification") as EhsUpdate["notification"], authorityRecord: readField(form, "authority"),
    };
    const at = new Date().toISOString();
    await change((state) => updateEhsCase(state, item.id, advance && next ? next : item.stage, update, at));
  };
  return <section aria-label="EHS case details">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="break-words text-lg font-semibold">{item.summary}</h2>
        <p className="mt-1 break-words text-sm text-muted">{item.country} · {item.site} · {item.category}{item.vehicle && ` · ${item.vehicle}`}</p></div>
      <button className="ops-button" onClick={close}>Back to case register</button>
    </div>
    <p className="my-3 text-sm">{EHS_PRIORITY[item.priority].label} · {shared ? TEAM_STAGES[shared.stage] : EHS_STAGES[item.stage]} · <time dateTime={item.occurredAt}>{dateTime(item.occurredAt)}</time></p>
    {item.priority === "critical" && <p className="mb-3 text-sm font-semibold text-bad">{EHS_PRIORITY.critical.notify}.</p>}
    <TeamCaseLink source={ehsSource(item)} teamId={linked} />
    {next && <form key={item.history.length} aria-label="Update EHS case" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className={LABEL}>Case owner<input name="owner" className={FIELD} defaultValue={item.owner} required maxLength={80} /></label>
      <label className={LABEL}>Accountable manager<input name="manager" className={FIELD} defaultValue={item.manager} required maxLength={80} /></label>
      <label className={LABEL}>Follow-up date<input name="due" className={FIELD} type="date" defaultValue={item.due} required /></label>
      <label className={LABEL}>Updated by<input name="actor" className={FIELD} required maxLength={80} /></label>
      <label className={LABEL}>External reporting<select name="notification" className={FIELD} defaultValue={item.notification}>
        <option value="pending">Pending review</option><option value="reported">Filed with authority</option><option value="not_required">Reviewed · not required</option>
      </select></label>
      <label className={LABEL}>Authority filing reference or decision basis<input name="authority" className={FIELD} defaultValue={item.authorityRecord} maxLength={300} /></label>
      <div className="sm:col-span-2">
        <label className={LABEL}>Update note<textarea name="detail" className={FIELD} required maxLength={600} aria-describedby="ehs-step" /></label>
        <p id="ehs-step" className="mt-1 text-xs text-muted">{hints[next]}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="ops-button" disabled={saving}>Save case update</button>
        <button className="ops-button" value="advance" disabled={saving}>{action[next]}</button>
      </div>
    </form>}
    <section aria-label="EHS case history" className="mt-6 border-t border-border pt-4">
      <h3 className="font-semibold">{shared ? "History on this device" : "Case history"}</h3>
      <ol className="mt-2 divide-y divide-border">
        {[...item.history].reverse().map((event, index) => <li key={index} className="break-words py-3 text-sm">
          <strong>{EHS_STAGES[event.stage]}</strong> · {event.actor} · <time dateTime={event.at}>{dateTime(event.at)}</time>
          <p className="mt-1 text-muted">{event.detail}</p>
          {event.owner && <p className="mt-1 text-xs text-muted">Owner {event.owner} · Manager {event.manager} · Follow-up <time className="whitespace-nowrap font-mono" dateTime={event.due}>{event.due}</time></p>}
        </li>)}
      </ol>
    </section>
  </section>;
}

export default function EhsPage() {
  const { status, dataset } = useEngine();
  const { state, change, saving, error } = useGarageOperations();
  const [report, setReport] = useState(false), [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("active"), [query, setQuery] = useState("");
  const today = localDate(new Date());
  const cases = state.ehsCases ?? [];
  const detail = cases.find((item) => item.id === selection);
  const priorityOrder = Object.keys(EHS_PRIORITY);
  const visible = cases.filter((item) => (item.stage === "closed") === (filter === "closed") &&
    [item.summary, item.vehicle, item.owner, item.manager, item.country, item.site].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) || a.due.localeCompare(b.due));
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-[30px] font-semibold leading-tight tracking-tight md:text-[38px]">Environment, health &amp; safety</h1>
        <p className="mt-2 text-sm text-muted">Fleet, workshop and site incidents across the GCC.</p>
      </div>
      <div className="flex flex-wrap gap-2"><Link href="/team-cases/" className="ops-button">Shared EHS cases</Link><a className="ops-button" href="#ehs-procedure">Incident SOP</a></div>
    </header>
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Incident register</h2>
          <p className="mt-1 text-sm text-muted">{dataset === "demo" ? "Practice records stay in this tab." : "Records are saved in this browser’s fleet workspace."}</p></div>
        {!detail && <button className="ops-button" disabled={status !== "ready" || saving} onClick={() => setReport(!report)}>{report ? "Cancel report" : "Report EHS incident"}</button>}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-bad">{error}</p>}
      {status !== "ready" ? <p role="status" className="text-sm text-muted">{status === "failed" ? "The incident register is unavailable. Check the fleet workspace." : "Loading incident register…"}</p>
        : detail ? <CaseDetail key={detail.id} item={detail} change={change} saving={saving} linked={state.sharedTeamId} close={() => setSelection("")} />
        : report ? <CaseReport change={change} saving={saving} done={(id) => { setReport(false); setSelection(id); }} />
        : <><div className="flex flex-wrap gap-3">
          <label className={LABEL}>Case status<select className={FIELD} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active</option><option value="closed">Closed</option></select></label>
          <label className={`${LABEL} min-w-0 flex-1`}>Search incidents<input className={FIELD} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Site, vehicle, owner or manager" /></label>
        </div>
          {!visible.length ? <p className="mt-4 text-sm text-muted">No {filter} EHS cases {query ? "match your search." : "recorded."}</p>
            : <ul aria-label="EHS cases" className="mt-4 divide-y divide-border border-t border-border">
              {visible.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1 break-words text-sm">
                  <h3 className="font-semibold">{item.summary}</h3>
                  <p className="text-muted">{item.country} · {item.site} · {EHS_PRIORITY[item.priority].label} · {EHS_STAGES[item.stage]}</p>
                  <p className="text-muted">Owner {item.owner || "Unassigned"} · Manager {item.manager || "Unassigned"} · Follow-up <time className="font-mono" dateTime={item.due}>{item.due}</time>
                    {item.stage !== "closed" && item.due < today && <strong className="ms-2 text-bad">Overdue</strong>}</p>
                </div>
                <button className="ops-button" onClick={() => setSelection(item.id)} aria-label={`Open case ${item.summary}`}>Open case</button>
              </li>)}
            </ul>}
        </>}
    </Card>
    <section id="ehs-procedure" aria-labelledby="ehs-procedure-title" className="scroll-mt-44">
      <Card>
        <h2 id="ehs-procedure-title" className="text-lg font-semibold">Incident response SOP</h2>
        <ol className="mt-3 grid list-decimal gap-x-9 gap-y-4 ps-5 sm:grid-cols-2">
          {SOP.map(([title, step]) => <li key={title} className="ps-1 text-sm"><strong>{title}</strong><p className="mt-1 text-muted">{step}</p></li>)}
        </ol>
        <p className="mt-4 text-sm text-muted">For vehicle recovery, insurance and release, <Link href="/" className="text-accent-ink underline">open the damage SOP in Daily Command</Link>.</p>
      </Card>
    </section>
    <Card>
      <h2 className="text-lg font-semibold">Escalation method</h2>
      <ul className="mt-3 grid gap-3 lg:grid-cols-3">
        {Object.values(EHS_PRIORITY).map((level) => <li className="rounded-lg border border-border p-3 text-sm" key={level.label}>
          <h3 className="font-semibold">{level.label}</h3><p className="mt-1 text-muted">{level.example}</p>
          <p className="mt-2">{level.notify}.</p><p className="mt-1 text-muted">Follow-up target · {level.followUp}</p>
        </li>)}
      </ul>
      <p className="mt-4 text-sm text-muted">These are internal operating targets. Use your local emergency plan and confirm statutory contacts and reporting deadlines with the local EHS lead. Log the filing reference or decision in the case.</p>
    </Card>
    <Card>
      <h2 className="text-lg font-semibold">EHS standards and guidance</h2>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
        {STANDARDS.map(([name, description, href]) => <li key={name} className="text-sm"><a href={href} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline">{name}</a><p className="mt-1 text-muted">{description}</p></li>)}
      </ul>
    </Card>
  </div>;
}
