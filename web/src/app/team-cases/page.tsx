"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui";
import { useEngine } from "@/components/engine-provider";
import { useGarageOperations } from "@/components/garage/use-garage";
import { useTeam } from "@/components/team-provider";
import { EHS_CATEGORIES, EHS_COUNTRIES, EHS_PRIORITY, reportEhsCase, type EhsReport } from "@/lib/ehs";
import { emptyGarage } from "@/lib/garage";
import {
  changeTeamCase, nextTeamStage, publishTeamCase, shareableEhs, teamCaseLabels, teamClient,
  NOTICE_LABELS, TEAM_COUNTRIES, TEAM_STAGES, type TeamCase, type TeamCaseEvent, type TeamStage,
} from "@/lib/team-cases";

const field = "ops-input min-h-11 w-full";
const label = "garage-field min-w-0";
const get = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const readTime = (value: string) => new Date(value).toLocaleString();
const ACTION: Partial<Record<TeamStage, string>> = {
  escalated: "Record escalation", contained: "Record containment", corrective: "Record corrective action",
  awaiting_document: "Mark awaiting document", closed: "Verify and close",
};
type Run = (fn: () => Promise<void>) => Promise<void>;

function Login({ run, pending }: { run: Run; pending: boolean }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const { error } = await teamClient!.auth.signInWithPassword({ email: get(data, "email"), password: String(data.get("password") ?? "") });
      if (error) throw new Error("Sign-in failed. Check your work email, password and team access.");
    });
  };
  return <Card><h2 className="text-lg font-semibold">Sign in to team cases</h2>
    <p className="mt-2 text-sm text-muted">Use the verified FleetOps account from your team administrator.</p>
    <form method="post" onSubmit={submit} className="mt-4 grid max-w-xl gap-3">
      <label className={label}>Work email<input className={field} type="email" name="email" autoComplete="username" required /></label>
      <label className={label}>Password<input className={field} type="password" name="password" autoComplete="current-password" required /></label>
      <div><button type="submit" className="ops-button" disabled={pending}>Sign in</button></div>
    </form>
  </Card>;
}

function TeamSetup({ pending, run, invite, setInvite }: { pending: boolean; run: Run; invite: string; setInvite: (code: string) => void }) {
  const team = useTeam();
  const myRole = team.members.find((member) => member.user_id === team.session?.user.id)?.role;
  const rpcForm = (event: FormEvent<HTMLFormElement>, method: "fleet_create_team" | "fleet_join_team" | "fleet_invite_member") => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const parameters = method === "fleet_create_team" ? { p_name: get(data,"team") } : method === "fleet_join_team"
        ? { p_code: get(data,"invite") } : { p_team: team.teamId, p_email: get(data,"member") };
      const result = await teamClient!.rpc(method, parameters);
      if (result.error) throw new Error(result.error.message);
      if (method === "fleet_invite_member") setInvite(String(result.data));
      else team.selectTeam(String(result.data));
      await team.refresh();
    });
  };
  return <Card><h2 className="text-lg font-semibold">Team access</h2>
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      <form onSubmit={(event) => rpcForm(event, "fleet_create_team")} className="flex flex-wrap items-end gap-2">
        <label className={`${label} flex-1`}>New team name<input className={field} name="team" maxLength={100} required /></label>
        <button className="ops-button" disabled={pending}>Create team</button>
      </form>
      <form onSubmit={(event) => rpcForm(event, "fleet_join_team")} className="flex flex-wrap items-end gap-2">
        <label className={`${label} flex-1`}>Invitation code<input className={field} name="invite" autoComplete="off" required /></label>
        <button className="ops-button" disabled={pending}>Join team</button>
      </form>
      {myRole === "admin" && <form onSubmit={(event) => rpcForm(event, "fleet_invite_member")} className="flex flex-wrap items-end gap-2">
        <label className={`${label} flex-1`}>Manager work email<input className={field} type="email" name="member" required /></label>
        <button className="ops-button" disabled={pending}>Create invitation</button>
      </form>}
      {invite && <label className={label}>Invitation code for the manager
        <input className={field} value={invite} readOnly />
        <span className="text-xs text-muted">Share this single-use code with that manager. It is linked to their verified work email and expires in seven days.</span>
      </label>}
    </div>
    {myRole === "admin" && <ul aria-label="Team members" className="mt-4 divide-y divide-border">
      {team.members.filter((member) => member.role === "member").map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="break-all text-sm">{member.email}</span>
        <button className="ops-button" disabled={pending} onClick={() => {
          if (!window.confirm(`Remove ${member.email} from this team?`)) return;
          void run(async () => {
            const { error } = await teamClient!.rpc("fleet_remove_member", { p_team: team.teamId, p_member: member.user_id });
            if (error) throw new Error(error.message);
            await team.refresh();
          });
        }}>Remove access</button>
      </li>)}
    </ul>}
  </Card>;
}

function Report({ onSaved, pending, run }: { onSaved: (id: string) => void; pending: boolean; run: Run }) {
  const team = useTeam();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const report = { country: get(data,"country"), category: get(data,"category"), priority: get(data,"priority"),
        site: get(data,"site"), vehicle: get(data,"vehicle"), occurredAt: get(data,"occurred"),
        summary: get(data,"summary"), reporter: team.session!.user.email,
      } as EhsReport;
      const item = reportEhsCase(emptyGarage(), report, crypto.randomUUID()).ehsCases![0];
      const id = await publishTeamCase(team.teamId, shareableEhs(item));
      await team.refresh();
      onSaved(id);
    });
  };
  return <form onSubmit={submit} aria-label="Report a team EHS incident" className="grid gap-3 sm:grid-cols-2">
    <label className={label}>Country<select className={field} name="country">{EHS_COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></label>
    <label className={label}>Site or location<input name="site" className={field} maxLength={120} required /></label>
    <label className={label}>Category<select className={field} name="category">{EHS_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label className={label}>Severity<select className={field} name="priority" defaultValue="" required><option value="" disabled>Choose severity</option>
      {Object.entries(EHS_PRIORITY).map(([key, priority]) => <option value={key} key={key}>{priority.label}</option>)}</select></label>
    <label className={label}>Incident time (local)<input name="occurred" type="datetime-local" className={field} required /></label>
    <label className={label}>Vehicle or work order reference<input name="vehicle" className={field} maxLength={80} /></label>
    <label className={`${label} sm:col-span-2`}>What happened<textarea name="summary" className={field} maxLength={180} required />
      <span className="text-xs text-muted">Describe what the team needs to act. Keep personal medical details in authorized records.</span></label>
    <div><button className="ops-button" disabled={pending}>Share incident with team</button></div>
  </form>;
}

function CaseDetails({ item, onBack, run, pending }: { item: TeamCase; onBack: () => void; run: Run; pending: boolean }) {
  const team = useTeam();
  const [events, setEvents] = useState<TeamCaseEvent[]>([]);
  const [historyError, setHistoryError] = useState("");
  const user = team.session?.user.id;
  const role = team.members.find((member) => member.user_id === user)?.role;
  const canChange = role === "admin" || [item.created_by, item.owner_id, item.manager_id].includes(user ?? "");
  const canAssign = role === "admin" || [item.created_by,item.manager_id].includes(user ?? "");
  const next = nextTeamStage(item);
  useEffect(() => {
    let active = true;
    void teamClient!.from("fleet_case_events").select("id,actor_email,stage,note,at,owner_email,manager_email,follow_up").eq("case_id",item.id).order("id",{ ascending:false }).limit(120)
      .then(({data,error}) => { if (active) { setEvents(data ?? []); setHistoryError(error?.message ?? ""); } });
    return () => { active = false; };
  }, [item.id,item.revision]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const advance = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "advance";
    void run(async () => {
      await changeTeamCase({
        p_id: item.id, p_revision: item.revision, p_stage: (advance && next) || item.stage,
        p_owner: canAssign ? get(data,"owner") || null : item.owner_id, p_manager: canAssign ? get(data,"manager") || null : item.manager_id,
        p_follow_up: get(data,"due") || null, p_note: get(data,"note"),
        p_reporting: (get(data,"reporting") || null) as TeamCase["reporting"],
        p_reporting_reference: get(data,"reference") || null, p_proof: null,
      });
      await team.refresh();
    });
  };
  const memberLabel = (id: string | null) => id ? team.members.find((member) => member.user_id === id)?.email ?? "Former team member" : "Unassigned";
  const assignment = (name: string, title: string, id: string | null) => <label className={label}>{title}
    <select className={field} name={name} defaultValue={id ?? ""} disabled={!canAssign}>
      <option value="">Unassigned</option>
      {id && !team.members.some((member) => member.user_id === id) && <option value={id}>Former team member</option>}
      {team.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.email}</option>)}
    </select>
  </label>;
  return <section aria-label="Shared case details">
    <div className="flex flex-wrap justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-semibold">{item.title}</h2>
      <button className="ops-button" onClick={onBack}>Back to cases</button>
    </div>
    <p className="my-2 text-sm text-muted">{TEAM_COUNTRIES[item.country]} · {teamCaseLabels[item.kind]} · {TEAM_STAGES[item.stage]} · Due <time dateTime={item.due_on}>{item.due_on}</time></p>
    {item.context.site && <p className="text-sm">{item.context.site} · {item.context.category} · {item.context.priority}</p>}
    {item.context.vehicle && <p className="text-sm">Vehicle reference {item.context.vehicle}</p>}
    {item.context.originalOwner && <p className="text-sm text-muted">Original assignment {item.context.originalOwner}</p>}
    <p className="mb-4 mt-2 break-words text-sm">Owner {memberLabel(item.owner_id)} · Manager {memberLabel(item.manager_id)}{item.follow_up && ` · Follow-up ${item.follow_up}`}</p>
    {item.stage === "closed" && item.proof && <p className="text-sm">Verified evidence {item.proof.reference} · Valid through {item.proof.expiresOn}</p>}
    {item.stage === "closed" && item.reporting_reference && <p className="text-sm">Reporting decision {item.reporting_reference}</p>}
    {canChange && item.stage !== "closed" && <form key={item.revision} onSubmit={submit} aria-label="Update shared case" className="grid gap-3 sm:grid-cols-2">
      {assignment("owner","Case owner",item.owner_id)}
      {assignment("manager","Accountable manager",item.manager_id)}
      <label className={label}>Follow-up date<input type="date" name="due" className={field} defaultValue={item.follow_up ?? item.due_on} /></label>
      {item.kind === "ehs" && <>
        <label className={label}>External reporting<select name="reporting" className={field} defaultValue={item.reporting ?? ""}>
          <option value="">Pending review</option><option value="filed">Filed with authority</option><option value="reviewed_not_required">Reviewed · not required</option>
        </select></label>
        <label className={label}>Reporting reference or decision basis<input name="reference" className={field} maxLength={300} defaultValue={item.reporting_reference ?? ""} /></label>
      </>}
      <label className={`${label} sm:col-span-2`}>Update note<textarea name="note" className={field} maxLength={900} required /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="ops-button" disabled={pending}>Save case update</button>
        {next && <button className="ops-button" disabled={pending} value="advance">{ACTION[next]}</button>}
      </div>
    </form>}
    {item.kind !== "ehs" && item.stage !== "closed" && <p className="mt-3 text-sm text-muted">
      Confirm the updated evidence in <Link href="/documents/" className="text-accent-ink underline">Documents</Link> on a device linked to the fleet workspace, then open <Link href="/" className="text-accent-ink underline">Daily Command</Link> to reconcile it.
    </p>}
    <h3 className="mt-5 font-semibold">Case history</h3>
    {historyError && <p role="alert" className="text-sm text-bad">{historyError}</p>}
    <ol className="mt-2 divide-y divide-border">
      {events.map((event) => <li key={event.id} className="break-words py-2 text-sm">
        <p><strong>{TEAM_STAGES[event.stage]}</strong> · {event.actor_email} · <time dateTime={event.at}>{readTime(event.at)}</time></p>
        <p className="whitespace-pre-wrap text-muted">{event.note}</p>
        {(event.owner_email || event.manager_email || event.follow_up) && <p className="text-xs text-muted">
          Owner {event.owner_email ?? "Unassigned"} · Manager {event.manager_email ?? "Unassigned"} · Follow-up {event.follow_up ?? "Unscheduled"}
        </p>}
      </li>)}
    </ol>
  </section>;
}

function TeamInbox({ open, run }: { open: (id: string) => void; run: Run }) {
  const team = useTeam();
  const [feedback, setFeedback] = useState("");
  return <Card><h2 id="inbox" className="scroll-mt-44 text-lg font-semibold">Notifications</h2>
    <div className="my-2 flex flex-wrap gap-2">
      <button className="ops-button" onClick={() => void team.refresh()}>Refresh notifications</button>
      <button className="ops-button" onClick={() => {
        if (typeof Notification === "undefined") { setFeedback("This browser supports the FleetOps inbox."); return; }
        void run(async () => {
          const answer = await Notification.requestPermission();
          setFeedback(answer === "granted" ? "Desktop notifications are enabled while FleetOps is open." : "Notifications are available in this inbox.");
        });
      }}>Enable desktop notifications</button>
    </div>
    {feedback && <p role="status" className="text-sm text-muted">{feedback}</p>}
    {team.inbox.length ? <ul className="divide-y divide-border" aria-label="Team notifications">{team.inbox.map((entry) => <li key={entry.id}
      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <p>{entry.read_at ? "" : "Unread · "}{NOTICE_LABELS[entry.event_type]}{entry.iso_title && ` · ${entry.iso_title}`} · {team.teams.find((t) => t.id === entry.team_id)?.name} · {readTime(entry.created_at)}</p>
      {entry.iso_id ? <Link className="ops-button" href={`/iso/#${entry.iso_id}`} onClick={() => {
        team.selectTeam(entry.team_id);
        if (!entry.read_at) void run(() => team.markRead(entry.id));
      }}>Open ISO record</Link> : <button className="ops-button" onClick={() => {
        team.selectTeam(entry.team_id);
        if (entry.case_id) open(entry.case_id);
        if (!entry.read_at) void run(() => team.markRead(entry.id));
      }}>Open case</button>}
    </li>)}</ul> : <p className="py-2 text-sm text-muted">No team notifications yet.</p>}
  </Card>;
}

export default function TeamCasesPage() {
  const team = useTeam();
  const engine = useEngine();
  const garage = useGarageOperations();
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [invite, setInvite] = useState("");
  const [selected, setSelected] = useState(""), [report, setReport] = useState(false);
  const [linkConsent, setLinkConsent] = useState(false), [filter, setFilter] = useState("active"), [search, setSearch] = useState("");
  const linked = garage.state.sharedTeamId;
  const caseId = selected || (typeof window !== "undefined" ? window.location.hash.slice(1).replace(/^case-/, "") : "");
  const details = team.cases.find((item) => item.id === caseId);
  const run: Run = async (fn) => {
    setPending(true); setError("");
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "Team operation failed."); }
    finally { setPending(false); }
  };
  const shell = (body: ReactNode) => <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="text-[30px] font-semibold leading-tight tracking-tight md:text-[38px]">Team cases</h1>
      <p className="mt-2 text-sm text-muted">Shared EHS incidents, overdue compliance cases and manager notifications.</p>
    </div><Link href="/ehs/#ehs-procedure" className="ops-button">EHS incident SOP</Link></header>
    {(error || team.error || garage.error) && <p role="alert" className="text-sm text-bad">{error || team.error || garage.error}</p>}
    {body}
  </div>;
  if (!teamClient) return shell(<Card><p className="text-sm">Team cases are unavailable on this dashboard build.</p></Card>);
  if (!team.session) return shell(<Login run={run} pending={pending} />);
  const visible = team.cases.filter((item) => (item.stage === "closed") === (filter === "closed")
    && [item.title,item.context.vehicle ?? "",item.kind,TEAM_COUNTRIES[item.country] ?? ""].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())));
  return shell(<>
    <div className="flex flex-wrap items-end justify-between gap-3">
      {team.teams.length > 0 && <label className={label}>Team<select className={field} value={team.teamId}
        onChange={(event) => { team.selectTeam(event.target.value); setInvite(""); setSelected(""); setReport(false); }}>
        {team.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="break-all text-muted">{team.session.user.email}</span>
        <button className="ops-button" disabled={pending} onClick={() => void run(async () => { await teamClient!.auth.signOut({ scope: "local" }); setInvite(""); setSelected(""); })}>Sign out</button></div>
    </div>
    {team.teamId && <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Shared register</h2>
        {!details && <button className="ops-button" disabled={pending} onClick={() => setReport(!report)}>{report ? "Cancel report" : "Report shared EHS incident"}</button>}
      </div>
      {details ? <CaseDetails key={details.id} item={details} run={run} pending={pending} onBack={() => { setSelected(""); history.replaceState(null,"",location.pathname); }} />
        : report ? <Report run={run} pending={pending} onSaved={(id) => { setReport(false); setSelected(id); }} />
        : <>
          <div className="flex flex-wrap gap-3">
            <label className={label}>Case status<select className={field} value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="active">Active</option><option value="closed">Closed</option>
            </select></label>
            <label className={`${label} flex-1`}>Find case<input className={field} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
          <ul className="mt-2 divide-y divide-border" aria-label="Shared cases">
            {visible.map((item) => <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={item.id}>
              <div className="min-w-0 break-words"><p className="font-semibold">{item.title}</p>
                <p className="text-muted">{TEAM_COUNTRIES[item.country]} · {TEAM_STAGES[item.stage]} · Due {item.follow_up ?? item.due_on}</p>
                <p className="text-muted">Owner {team.members.find((m) => m.user_id === item.owner_id)?.email ?? "Unassigned"} · Manager {team.members.find((m) => m.user_id === item.manager_id)?.email ?? "Unassigned"}</p></div>
              <button className="ops-button" onClick={() => { setSelected(item.id); location.hash = "case-" + item.id; }} aria-label={`Open ${item.title}`}>Open case</button>
            </li>)}
          </ul>
          {!visible.length && <p className="mt-3 text-sm text-muted">No {filter} cases match this view.</p>}
        </>}
    </Card>}
    <TeamInbox open={setSelected} run={run} />
    {team.teamId && <Card><h2 className="text-lg font-semibold">Link this browser’s fleet</h2>
      <p className="my-2 text-sm text-muted">Shared case summaries and verified document references are visible to team members. Fleet workbooks and document files remain in this browser.</p>
      {engine.dataset !== "mine" ? <Link href="/import/" className="ops-button">Open your fleet data</Link>
        : linked === team.teamId ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm">This fleet publishes active EHS and compliance cases to this team.</span>
          <button className="ops-button" disabled={garage.saving} onClick={() => void garage.change((state) => ({ ...state, sharedTeamId: undefined }))}>Unlink this browser</button></div>
        : <div className="flex flex-wrap items-center gap-3">
          {linked && <p className="text-sm text-muted">Switch to the linked team and unlink it before choosing another team.</p>}
          {!linked && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={linkConsent} onChange={(event) => setLinkConsent(event.target.checked)} /> Share this fleet’s active case summaries with this team</label>
            <button className="ops-button" disabled={!linkConsent || garage.saving}
              onClick={() => void garage.change((state) => ({ ...state, sharedTeamId: team.teamId }))}>Link fleet</button></>}
        </div>}
    </Card>}
    <TeamSetup run={run} pending={pending} invite={invite} setInvite={setInvite} />
  </>);
}
