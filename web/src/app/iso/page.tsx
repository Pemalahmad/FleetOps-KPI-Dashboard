"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/components/team-provider";
import { Card, Skeleton } from "@/components/ui";
import { teamClient, type TeamMember } from "@/lib/team-cases";
import { AUDIT_TYPES, dubaiToday, ISO_KINDS, ISO_STANDARDS, ISO_STATUS, isoStatus, type IsoDraft, type IsoEvent, type IsoKind, type IsoRecord } from "@/lib/iso-certification";

const FIELD = "ops-input min-h-11 min-w-0 w-full";
const LABEL = "garage-field min-w-0";
const SINGULAR = { certificate: "certificate", audit: "audit", finding: "finding" };
const COLOR = { bad: "text-bad", warn: "text-warn", good: "text-good", muted: "text-muted" };
const EVENT_LABEL = { created: "Created", updated: "Updated", verified: "Certificate verified", escalated: "Overdue finding escalated", resolved: "Finding resolved" };
const NO_RECORDS: IsoRecord[] = [];

function useIsoRecords(scope: string, teamId: string) {
  const [data, setData] = useState<{ scope: string; records: IsoRecord[]; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    if (!teamClient || !scope) return;
    let active = true;
    let sequence = 0;
    const load = async () => {
      const ticket = ++sequence;
      const rows: IsoRecord[] = [];
      const pageSize = 400;
      let failure = "";
      for (let offset = 0; active && ticket === sequence; offset += pageSize) {
        const { data,error } = await teamClient!.from("fleet_iso_records").select("*").eq("team_id",teamId).order("id").range(offset,offset+pageSize-1);
        if (error) { failure = error.message; break; }
        rows.push(...data);
        if (data.length < pageSize) break;
      }
      if (active && ticket === sequence) setData((prev) => ({
        scope, records: failure ? prev?.scope === scope ? prev.records : NO_RECORDS :
          rows.sort((a,b) => (a.due_on ?? "").localeCompare(b.due_on ?? "")), error: failure,
      }));
    };
    void load();
    const timer = setInterval(load, 15_000);
    window.addEventListener("focus",load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus",load); };
  },[scope,teamId,reload]);
  const current = data?.scope === scope ? data : null;
  return { records: current?.records ?? NO_RECORDS, error: current?.error ?? "", loading: Boolean(scope && !current), refresh };
}

function MemberSelect({ title, field, members, initial, writable }: {
  title: string; field: string; members: TeamMember[]; initial?: string; writable: boolean;
}) {
  return <label className={LABEL}>{title}<select name={field} className={FIELD} defaultValue={initial ?? ""} disabled={!writable} required>
    <option value="" disabled>Select a team member</option>
    {initial && !members.some((member) => member.user_id === initial) && <option value={initial}>Former team member</option>}
    {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.email}</option>)}
  </select></label>;
}

function RecordForm({ kind, item, records, members, user, teamId, onSave, onCancel }: {
  kind: IsoKind; item?: IsoRecord; records: IsoRecord[]; members: TeamMember[]; user: string; teamId: string; onSave: (id: string) => void; onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision] = useState(item?.revision ?? null);
  const [status, setStatus] = useState(item?.status ?? Object.keys(ISO_STATUS[kind])[0]);
  const [certificate, setCertificate] = useState(item?.certificate_id ?? "");
  const isAdmin = members.some((m) => m.user_id === user && m.role === "admin");
  const canAssign = !item || isAdmin || user === item.created_by || user === item.manager_id;
  const canVerifyCertificate = isAdmin || Boolean(item && user === item.manager_id);
  const canResolve = Boolean(item && user !== item.owner_id && (isAdmin || user === item.manager_id));
  const certificates = records.filter((row) => row.kind === "certificate");
  const audits = records.filter((row) => row.kind === "audit" && row.certificate_id === certificate);
  const labelMap = Object.entries(ISO_STATUS[kind]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (field: string) => String(form.get(field) ?? "").trim() || null;
    setSaving(true); setError("");
    try {
      const p_record: IsoDraft = {
        kind, title: value("title") ?? "", status,
        certificate_id: item?.certificate_id ?? (certificate || null),
        audit_id: item?.audit_id ?? value("audit"),
        standard: value("standard"), entity: value("entity"), sites: value("sites"), scope: value("scope"),
        issuer: value("issuer"), certificate_number: value("certificate_number"), issue_on: value("issue_on"),
        due_on: value("due_on"), closed_on: value("closed_on"), audit_type: value("audit_type"), severity: value("severity"),
        owner_id: (canAssign ? value("owner") : item?.owner_id) ?? "",
        manager_id: (canAssign ? value("manager") : item?.manager_id) ?? "",
        evidence: value("evidence"), notes: value("notes"),
      };
      const result = await teamClient!.rpc("fleet_save_iso", { p_team: teamId, p_id: item?.id ?? null, p_revision: revision, p_record });
      if (result.error) throw new Error(result.error.message);
      onSave(String(result.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The record could not be saved.");
    } finally { setSaving(false); }
  };
  const certificateVerified = kind === "certificate" && status === "verified";
  const completeAudit = kind === "audit" && status === "completed";
  const resolvedFinding = kind === "finding" && status === "resolved";
  return <form aria-label={item ? "Edit " + SINGULAR[kind] : "Add " + SINGULAR[kind]} method="post" onSubmit={(event) => void save(event)}>
    <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
      <label className={LABEL}>Title<input name="title" className={FIELD} defaultValue={item?.title} maxLength={180} required /></label>
      <label className={LABEL}>Status<select value={status} onChange={(event) => setStatus(event.target.value)} className={FIELD}>
        {labelMap.map(([key,label]) => <option key={key} value={key} disabled={key === "verified" && !canVerifyCertificate && status !== "verified" ||
          key === "resolved" && !canResolve && status !== "resolved"}>{label}</option>)}
      </select></label>
      {kind === "certificate" ? <>
        <label className={LABEL}>Standard and edition<select name="standard" defaultValue={item?.standard ?? ""} className={FIELD} required>
          <option value="" disabled>Select a standard</option>{ISO_STANDARDS.map((standard) => <option key={standard}>{standard}</option>)}
        </select></label>
        <label className={LABEL}>Legal entity<input name="entity" className={FIELD} defaultValue={item?.entity ?? ""} required maxLength={180} /></label>
        <label className={LABEL}>Covered sites<input name="sites" className={FIELD} defaultValue={item?.sites ?? ""} maxLength={400} /></label>
        <label className={LABEL}>Certificate scope<input name="scope" className={FIELD} defaultValue={item?.scope ?? ""} required maxLength={800} /></label>
        <label className={LABEL}>Certification body<input name="issuer" className={FIELD} defaultValue={item?.issuer ?? ""} required={certificateVerified} maxLength={180} /></label>
        <label className={LABEL}>Certificate number<input name="certificate_number" className={FIELD} defaultValue={item?.certificate_number ?? ""} required={certificateVerified} maxLength={120} /></label>
        <label className={LABEL}>Issue date<input type="date" name="issue_on" className={FIELD} defaultValue={item?.issue_on ?? ""} required={certificateVerified} /></label>
      </> : <label className={LABEL}>Certificate<select className={FIELD} value={certificate} disabled={Boolean(item)}
        onChange={(event) => setCertificate(event.target.value)} required>
        <option value="" disabled>Select a certificate</option>{certificates.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select></label>}
      {kind === "audit" && <>
        <label className={LABEL}>Audit type<select name="audit_type" className={FIELD} defaultValue={item?.audit_type ?? "surveillance"}>
          {Object.entries(AUDIT_TYPES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className={LABEL}>Completed on<input type="date" name="closed_on" className={FIELD} defaultValue={item?.closed_on ?? ""} required={completeAudit} /></label>
      </>}
      {kind === "finding" && <>
        <label className={LABEL}>Audit<select key={certificate} className={FIELD} name="audit" defaultValue={item?.audit_id ?? ""} disabled={Boolean(item)} required>
          <option value="" disabled>Select an audit</option>{audits.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select></label>
        <label className={LABEL}>Severity<select className={FIELD} name="severity" defaultValue={item?.severity ?? "minor"}>
          <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
        </select></label>
      </>}
      <label className={LABEL}>{kind === "certificate" ? "Expiry date" : kind === "audit" ? "Scheduled audit date" : "Finding due date"}
        <input type="date" name="due_on" className={FIELD} defaultValue={item?.due_on ?? ""} required={kind !== "certificate" || status !== "planned"} />
      </label>
      <MemberSelect title="Record owner" field="owner" members={members} initial={item?.owner_id ?? user} writable={canAssign} />
      <MemberSelect title="Accountable manager" field="manager" members={members} initial={item?.manager_id} writable={canAssign} />
      <label className={LABEL}>{kind === "certificate" ? "Issuer verification reference" : kind === "audit" ? "Audit report reference" : "Corrective action and effectiveness evidence"}
        <input className={FIELD} name="evidence" defaultValue={item?.evidence ?? ""} maxLength={380} required={certificateVerified || completeAudit || resolvedFinding} />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>{kind === "finding" ? "Finding and corrective action notes" : "Notes"}
        <textarea className={FIELD} name="notes" defaultValue={item?.notes ?? ""} maxLength={1200} required={kind === "finding"} />
      </label>
    </fieldset>
    {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button className="ops-button" disabled={saving}>{saving ? "Saving…" : "Save " + SINGULAR[kind]}</button>
      <button type="button" className="ops-button" disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>;
}

function RecordDetail({ item, records, members, canEdit, onEdit, onBack }: {
  item: IsoRecord; records: IsoRecord[]; members: TeamMember[]; canEdit: boolean; onEdit: () => void; onBack: () => void;
}) {
  const [events, setEvents] = useState<IsoEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void teamClient!.from("fleet_iso_events").select("id,actor,action,at,snapshot")
      .eq("team_id",item.team_id).eq("iso_id",item.id).order("id",{ ascending:false }).limit(50)
      .then(({data,error}) => { if (current) { setEvents(data ?? []); setError(error?.message ?? ""); } });
    return () => { current = false; };
  },[item.team_id,item.id,item.revision,item.escalated_at]);
  const member = (id: string) => members.find((m) => m.user_id === id)?.email ?? "Former team member";
  const status = isoStatus(item,dubaiToday());
  const labels = [
    ["Standard",item.standard],["Legal entity",item.entity],["Covered sites",item.sites],["Scope",item.scope],
    ["Certification body",item.issuer],["Certificate number",item.certificate_number],["Issue date",item.issue_on],
    [item.kind === "certificate" ? "Expiry date" : "Due date",item.due_on],
    ["Audit type",AUDIT_TYPES[item.audit_type as keyof typeof AUDIT_TYPES]],["Severity",item.severity],
    ["Completed on",item.closed_on],["Evidence reference",item.evidence],["Verified by",item.checked_by],
    ["Escalated",item.escalated_at ? new Date(item.escalated_at).toLocaleString() : ""],
    ["Record owner",member(item.owner_id)],["Accountable manager",member(item.manager_id)],
    ["Certificate",records.find((row) => row.id===item.certificate_id)?.title],["Audit",records.find((row) => row.id===item.audit_id)?.title],
  ];
  return <section aria-label="ISO record details">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 break-words">
      <h2 className="text-lg font-semibold">{item.title}</h2><p className={COLOR[status.tone]}>{status.label}</p>
    </div><div className="flex flex-wrap gap-2">
      {canEdit && <button className="ops-button" onClick={onEdit}>Edit {SINGULAR[item.kind]}</button>}
      <button className="ops-button" onClick={onBack}>Back to register</button>
    </div></div>
    <dl className="my-4 grid gap-3 sm:grid-cols-2">{labels.filter(([,value]) => value).map(([label,value]) =>
      <div className="min-w-0 break-words text-sm" key={label}><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}</dl>
    {item.notes && <p className="mb-4 whitespace-pre-wrap break-words text-sm">{item.notes}</p>}
    <h3 className="font-semibold">Record history</h3>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <ol className="mt-2 divide-y divide-border" aria-label="ISO record history">{events.map((event) => <li className="break-words py-2 text-sm" key={event.id}>
      <strong>{EVENT_LABEL[event.action]}</strong> · {event.actor} · <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
      <p className="text-muted">{event.snapshot.due_on && "Deadline " + event.snapshot.due_on + " · "}{event.snapshot.evidence ?? "Status " + event.snapshot.status.replaceAll("_"," ")}</p>
    </li>)}</ol>
  </section>;
}

export default function IsoPage() {
  const team = useTeam();
  const user = team.session?.user.id ?? "";
  const scope = user && team.teamId ? user + "/" + team.teamId : "";
  const { records, error, loading, refresh } = useIsoRecords(scope,team.teamId);
  const [kind, setKind] = useState<IsoKind>("certificate");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState(false);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    const read = () => setSelected(window.location.hash.slice(1));
    const timer = setTimeout(read,0);
    window.addEventListener("hashchange",read);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange",read); };
  },[]);
  const item = records.find((row) => row.id === selected);
  const active = item?.kind ?? kind;
  const today = dubaiToday();
  const actor = team.members.find((member) => member.user_id === user);
  const canEdit = Boolean(item && (actor?.role === "admin" || [item.owner_id,item.manager_id,item.created_by].includes(user)));
  const visible = records.filter((row) => row.kind === active &&
    (!attention || ["warn","bad"].includes(isoStatus(row,today).tone) || row.status === "pending_verification") &&
    [row.title,row.entity,row.standard,row.certificate_number].some((field) => field?.toLowerCase().includes(search.trim().toLowerCase())));
  const view = (id: string) => {
    window.history.replaceState(null,"",id ? "#" + id : window.location.pathname);
    setSelected(id); setForm(null); setSaved("");
  };
  const onSave = (id: string) => {
    view(id); setSaved("Record saved."); refresh(); void team.refresh();
  };
  const owner = (id: string) => team.members.find((member) => member.user_id===id)?.email ?? "Former team member";
  const eligibleToCreate = active === "certificate" || records.some((row) => row.kind === (active === "audit" ? "certificate" : "audit"));
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="text-[30px] font-semibold leading-tight tracking-tight md:text-[38px]">ISO certification</h1>
      <p className="mt-2 text-sm text-muted">Track your team’s certificates, issuer audit dates and corrective actions.</p>
    </div><Link href="/doctrine/#SOP-10" className="ops-button">Full fleet SOP</Link></header>
    {!teamClient ? <Card><p className="text-sm">The team tracker is unavailable in this build.</p></Card>
      : !team.session || !team.teamId ? <Card>
        <p className="mb-3 text-sm">{team.session ? "Create or join a team to use the ISO tracker." : "Sign in to see your team’s ISO register."}</p>
        <Link href="/team-cases/" className="ops-button">Open Team cases</Link>
      </Card>
      : <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className={LABEL}>Team<select className={FIELD} value={team.teamId} onChange={(event) => { view(""); team.selectTeam(event.target.value); }}>
            {team.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
          <Link href="/team-cases/#inbox" className="ops-button">Team notifications</Link>
        </div>
        {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-bad">{error}<button className="ops-button" onClick={refresh}>Retry</button></div>}
        {saved && <p role="status" className="text-sm text-good">{saved}</p>}
        {loading ? <Skeleton height={300} /> : <Card>
          {form ? <RecordForm key={item?.id ?? active} kind={active} item={form === "edit" ? item : undefined} records={records}
            members={team.members} user={user} teamId={team.teamId} onSave={onSave} onCancel={() => setForm(null)} />
            : item ? <RecordDetail key={item.id} item={item} members={team.members} records={records} canEdit={canEdit} onEdit={() => setForm("edit")} onBack={() => { setKind(item.kind); view(""); }} />
            : <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div aria-label="ISO register views" role="group" className="flex flex-wrap gap-2">
                  {Object.entries(ISO_KINDS).map(([key,label]) => <button className="ops-button" key={key} aria-pressed={active===key}
                    onClick={() => { view(""); setKind(key as IsoKind); setSearch(""); }}>{label}</button>)}
                </div>
                <button className="ops-button" disabled={!eligibleToCreate || !actor} onClick={() => setForm("create")}>Add {SINGULAR[active]}</button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className={`${LABEL} flex-1`}>Find {SINGULAR[active]}<input className={FIELD} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} /> Needs attention</label>
              </div>
              {visible.length ? <ul className="mt-3 divide-y divide-border" aria-label={ISO_KINDS[active]}>
                {visible.map((row) => {
                  const status = isoStatus(row,today);
                  return <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0 break-words text-sm"><p className="font-semibold">{row.title}</p>
                      <p><span className={COLOR[status.tone]}>{status.label}</span>{row.due_on && <span className="text-muted"> · {row.kind === "certificate" ? "Expires" : "Due"} <time dateTime={row.due_on}>{row.due_on}</time></span>}</p>
                      <p className="text-muted">Owner {owner(row.owner_id)} · Manager {owner(row.manager_id)}</p>
                    </div><button className="ops-button" onClick={() => view(row.id)} aria-label={`Open ${row.title}`}>Open</button>
                  </li>;
                })}
              </ul> : <p className="mt-4 text-sm text-muted">{!eligibleToCreate ? active === "audit" ? "Add a certificate before scheduling an audit." : "Schedule an audit before recording findings." : `No ${ISO_KINDS[active].toLowerCase()} match this view.`}</p>}
            </>}
        </Card>}
      </>}
  </div>;
}
