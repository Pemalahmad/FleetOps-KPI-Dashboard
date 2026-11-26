"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { BellRinging, CheckCircle, ClipboardText, ShieldCheck, Siren, Wrench } from "@phosphor-icons/react";
import { commandActions, complianceReminders, REMINDER_LABELS, shiftHandoff, type ActionStatus, type ComplianceReminder } from "@/lib/garage-command";
import { caseOwner, ESCALATION_STAGES, type ComplianceEscalation } from "@/lib/garage-escalations";
import { downloadText } from "@/lib/exporters";
import {
  RECOVERY_STAGES,
  localDate,
  vehicleLabel,
  type GarageAlert,
  type GarageHandover,
  type GarageLane,
  type GarageState,
  type GarageVehicle,
  type RecoveryStage,
} from "@/lib/garage";

const NUM = new Intl.NumberFormat();
const PAGE_SIZE = 8;
const STATUS = ["Held", "Needs evidence", "Ready for review"] as const;
const REMINDER_FILTERS = ["GCC reminders", "Registration reminders", "Inspection reminders", "Overdue reminders"] as const;
const ESCALATION_FILTERS = ["Overdue escalations", "Closed escalations"] as const;
type ReminderFilter = typeof REMINDER_FILTERS[number];
type Filter = "All actions" | ActionStatus | "Overdue damage" | "Damage cases" | RecoveryStage | ReminderFilter | typeof ESCALATION_FILTERS[number];

function ReminderRow({ reminder, onOpen, onAssign, canAssign }: {
  reminder: ComplianceReminder;
  onOpen: (vehicleId: string) => void;
  onAssign: (id: string, owner: string) => Promise<boolean>;
  canAssign: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState("");
  const { vehicle, kind, dueOn, status, next } = reminder;
  const plate = vehicleLabel(vehicle.row);
  const urgent = status === "Overdue" || status === "Action needed";
  return (
    <li className="command-reminder" aria-label={plate + " " + REMINDER_LABELS[kind]}>
      <div className="command-reminder-summary">
        <span className={`command-priority-mark${urgent ? " command-priority-critical" : ""}`} aria-hidden="true" />
        <div className="command-priority-copy">
          <b>{plate} · {REMINDER_LABELS[kind]}</b>
          <small>{vehicle.row.gcc_country} · {status}{dueOn && <> · Due <time dateTime={dueOn}>{dueOn}</time></>}</small>
          <small>{next}</small>
          <em>Owner {reminder.owner || "Unassigned"}</em>
        </div>
        <div className="command-reminder-controls">
          <button className="command-open" onClick={() => onOpen(vehicle.row.vehicle_id)}>Open vehicle</button>
          {!editing && <button className="ops-button" disabled={!canAssign} onClick={() => { setOwner(reminder.owner); setEditing(true); }}>
            {reminder.owner ? "Change owner" : "Assign owner"}
          </button>}
        </div>
      </div>
      {editing && <form className="command-reminder-editor" onSubmit={async (e) => {
        e.preventDefault();
        if (await onAssign(reminder.id, owner)) setEditing(false);
      }}>
        <label className="garage-field">Reminder owner
          <input className="ops-input" placeholder="Name or team" value={owner} maxLength={120}
            onChange={(e) => setOwner(e.target.value)} disabled={!canAssign} />
        </label>
        <button className="ops-button" disabled={!canAssign || owner.trim() === reminder.owner}>Save owner</button>
        <button className="ops-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
        {reminder.owner && <span className="command-reminder-hint">Leave the owner blank to clear the assignment.</span>}
      </form>}
    </li>
  );
}

export interface CommandSummary {
  overdueDamage: number;
  incidentHolds: number;
  handoversToday: number;
  recoveryOpen: number;
  recovery: Record<RecoveryStage, number>;
}

export function buildCommandSummary(vehicles: GarageVehicle[], alerts: GarageAlert[], handovers: GarageHandover[], today: string): CommandSummary {
  const recovery = Object.fromEntries(RECOVERY_STAGES.map((stage) => [stage.id, 0])) as Record<RecoveryStage, number>;
  for (const vehicle of vehicles) if (vehicle.incident) recovery[vehicle.incident.stage] += 1;
  return {
    overdueDamage: alerts.filter((alert) => alert.id.startsWith("damage-overdue:")).length,
    incidentHolds: vehicles.filter((vehicle) => vehicle.lane === "incident").length,
    handoversToday: handovers.filter((handover) => localDate(new Date(handover.at)) === today).length,
    recoveryOpen: Object.values(recovery).reduce((total, count) => total + count, 0),
    recovery,
  };
}

interface RegionStatus { region: string; total: number; blocked: number; unknown: number; ready: number }

function regionStatuses(vehicles: GarageVehicle[]): RegionStatus[] {
  const result = new Map<string, RegionStatus>();
  for (const vehicle of vehicles) {
    const region = vehicle.row.gcc_country;
    if (!region) continue;
    const entry = result.get(region) ?? { region, total: 0, blocked: 0, unknown: 0, ready: 0 };
    const documentGates = vehicle.gates.filter((gate) => gate.id === "registration" || gate.id === "insurance" || gate.id.startsWith("gcc-"));
    entry.total += 1;
    if (documentGates.some((gate) => gate.status === "blocked")) entry.blocked += 1;
    else if (documentGates.some((gate) => gate.status === "unknown")) entry.unknown += 1;
    else entry.ready += 1;
    result.set(region, entry);
  }
  return [...result.values()].sort((a, b) => b.blocked - a.blocked || b.unknown - a.unknown || a.region.localeCompare(b.region));
}

function CommandMetric({ value, label, tone = "ink", onClick, pressed }: {
  value: number; label: string; tone?: "ink" | "bad" | "warn" | "good"; onClick?: () => void; pressed?: boolean;
}) {
  const content = <><b className={`tnum command-metric-value command-tone-${tone}`}>{NUM.format(value)}</b><span>{label}</span></>;
  return onClick ? <button className="command-metric" onClick={onClick} aria-pressed={pressed}>{content}</button> : <div className="command-metric">{content}</div>;
}

export function DailyCommandBoard({
  vehicles, alerts, handovers, today, now, region, snapshot, demo, reminderOwners, reminderLeadDays, canAssignReminder,
  escalations, onOpenEscalation, onAssignReminder, onOpenVehicle, onFilter, onOpenAlerts, onPractice,
}: {
  vehicles: GarageVehicle[];
  alerts: GarageAlert[];
  handovers: GarageHandover[];
  today: string;
  now: number;
  region: string;
  snapshot: string;
  demo: boolean;
  reminderOwners: GarageState["reminderOwners"];
  reminderLeadDays: number;
  canAssignReminder: boolean;
  onAssignReminder: (id: string, owner: string) => Promise<boolean>;
  escalations: ComplianceEscalation[];
  onOpenEscalation: (id: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
  onFilter: (lane: GarageLane) => void;
  onOpenAlerts: () => void;
  onPractice?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("All actions");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const queue = useRef<HTMLSelectElement>(null);
  const summary = buildCommandSummary(vehicles, alerts, handovers, today);
  const regions = useMemo(() => regionStatuses(vehicles), [vehicles]);
  const actions = useMemo(() => commandActions(vehicles, now), [vehicles, now]);
  const reminderDate = demo ? snapshot.slice(0, 10) : today;
  const reminders = useMemo(() => complianceReminders(vehicles, reminderOwners, reminderDate, reminderLeadDays),
    [vehicles, reminderOwners, reminderDate, reminderLeadDays]);
  const reminderView = REMINDER_FILTERS.some((name) => filter === name);
  const escalationView = ESCALATION_FILTERS.some((name) => filter === name);
  const openEscalations = escalations.filter((item) => item.stage !== "closed").length;
  const select = (value: Filter) => { setFilter(value); setPage(0); };
  const jumpToQueue = (value: Filter) => {
    select(value);
    queue.current?.focus({ preventScroll: true });
    queue.current?.scrollIntoView({ block: "nearest" });
  };
  const q = search.trim().toLowerCase();
  const matches = reminderView || escalationView ? [] : actions.filter((action) => {
    const { row, incident } = action.vehicle;
    if (q && ![row.vehicle_id, row.plate_number, row.home_site_name, action.owner].some((v) => v?.toLowerCase().includes(q))) return false;
    switch (filter) {
      case "All actions": return true;
      case "Overdue damage": return action.overdue;
      case "Damage cases": return Boolean(incident || row.collision_jobs);
      case "Held": case "Needs evidence": case "Ready for review": case "Renewal due": return action.status === filter;
      default: return incident?.stage === filter;
    }
  });
  const matchingReminders = reminderView ? reminders.filter((reminder) => {
    const { row } = reminder.vehicle;
    if (q && ![row.vehicle_id, row.plate_number, row.home_site_name, row.gcc_country, reminder.owner].some((v) => v?.toLowerCase().includes(q))) return false;
    if (filter === "Registration reminders") return reminder.kind === "registration";
    if (filter === "Inspection reminders") return reminder.kind === "inspection";
    if (filter === "Overdue reminders") return reminder.status === "Overdue";
    return true;
  }) : [];
  const matchingEscalations = escalationView ? escalations.filter((item) =>
    (item.stage === "closed") === (filter === "Closed escalations") &&
    (!q || [item.vehicleId, item.plate, item.country, caseOwner(item, reminderOwners), item.manager]
      .some((value) => value.toLowerCase().includes(q))))
    .sort((a, b) => filter === "Closed escalations"
      ? b.history.at(-1)!.at.localeCompare(a.history.at(-1)!.at) : a.dueOn.localeCompare(b.dueOn)) : [];
  const count = escalationView ? matchingEscalations.length : reminderView ? matchingReminders.length : matches.length;
  const lastPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const filterLabel = RECOVERY_STAGES.find((stage) => stage.id === filter)?.label ?? filter;
  return (
    <section className="garage-command" aria-label="Daily fleet command">
      <header className="garage-command-head">
        <div>
          <h2>Vehicle release desk</h2>
          <p>Review holds, assign the next action and document vehicle handovers.</p>
        </div>
        <div className="garage-command-links">
          <Link href="/licence/"><ShieldCheck size={16} /> GCC rules and evidence</Link>
          <button className="ops-button" onClick={() => jumpToQueue("GCC reminders")} aria-pressed={filter === "GCC reminders"}>
            <BellRinging size={16} aria-hidden="true" /> GCC reminders <span className="garage-count">{NUM.format(reminders.length)}</span>
          </button>
          <button className="ops-button" onClick={() => jumpToQueue("Overdue escalations")} aria-pressed={filter === "Overdue escalations"}>
            <Siren size={16} aria-hidden="true" /> Overdue escalations <span className="garage-count">{NUM.format(openEscalations)}</span>
          </button>
          <Link href="/doctrine/#SOP-09"><ClipboardText size={16} /> Damage SOP-09</Link>
          {onPractice && <button className="ops-button" onClick={onPractice}>Practice a damage case</button>}
          <button className="ops-button" disabled={!actions.length && !reminders.length && !openEscalations && !summary.handoversToday}
            onClick={() => {
              const at = Date.now();
              const currentReminders = complianceReminders(vehicles, reminderOwners, demo ? reminderDate : localDate(new Date(at)), reminderLeadDays);
              downloadText(`fleetops-shift-${localDate(new Date(at))}.txt`,
                shiftHandoff(commandActions(vehicles, at), handovers, region, snapshot, at, demo, currentReminders, escalations, reminderOwners));
            }}>Download shift handoff</button>
        </div>
      </header>

      <div className="command-rail" role="group" aria-label="Today at a glance">
        {STATUS.map((status, index) => <CommandMetric key={status} value={actions.filter((action) => action.status === status).length} label={status}
          tone={index === 0 ? "bad" : index === 1 ? "warn" : "ink"} pressed={filter === status} onClick={() => jumpToQueue(status)} />)}
        <CommandMetric value={summary.overdueDamage} label="Damage deadlines overdue" tone={summary.overdueDamage ? "bad" : "good"}
          pressed={filter === "Overdue damage"} onClick={() => jumpToQueue("Overdue damage")} />
        <CommandMetric value={summary.incidentHolds} label="Accident intake" tone="ink" onClick={() => onFilter("incident")} />
        <CommandMetric value={summary.handoversToday} label="Handovers recorded today" tone="good" />
      </div>

      <div className="command-workspace">
        <section className="command-priority" aria-labelledby="priority-actions-title">
          <header><div><Siren size={18} weight="duotone" /><h3 id="priority-actions-title">Vehicle actions</h3></div><button onClick={onOpenAlerts}>Open alert inbox</button></header>
          <div className="command-tools">
            <label className="garage-field">Action queue<select className="ops-input" ref={queue} value={filter} onChange={(e) => select(e.target.value as Filter)}>
              {(["All actions", ...STATUS, "Renewal due", "Overdue damage", "Damage cases"] as const).map((name) => <option key={name}>{name}</option>)}
              <optgroup label="Registration and inspection">{REMINDER_FILTERS.map((name) => <option key={name}>{name}</option>)}</optgroup>
              <optgroup label="Compliance escalations">{ESCALATION_FILTERS.map((name) => <option key={name}>{name}</option>)}</optgroup>
              <optgroup label="Damage stages">{RECOVERY_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</optgroup>
            </select></label>
            <label className="garage-field">Find vehicle or owner<input className="ops-input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
          </div>
          {reminderView && <p className="command-scope-note">Reminders appear {reminderLeadDays} days ahead. Assign an owner for each task.</p>}
          {count === 0 ? <div className="command-clear"><CheckCircle size={21} weight="fill" /><div><b>{escalationView ? "No matching escalations" : reminderView ? "No matching reminders" : "No matching actions"}</b><span>Choose another queue or clear the search.</span></div></div>
            : escalationView ? <ol aria-label="Compliance escalation results">{matchingEscalations.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((item) =>
              <li key={item.id} aria-label={item.plate + " " + REMINDER_LABELS[item.kind]}>
                <button onClick={() => onOpenEscalation(item.id)}>
                  <span className={`command-priority-mark ${item.stage === "closed" ? "command-priority-ready" : "command-priority-critical"}`} aria-hidden="true" />
                  <span className="command-priority-copy">
                    <b>{item.plate} · {REMINDER_LABELS[item.kind]}</b>
                    <small>{item.country} · {ESCALATION_STAGES[item.stage]} · Due <time dateTime={item.dueOn}>{item.dueOn}</time></small>
                    <em>Owner {caseOwner(item, reminderOwners) || "Unassigned"} · Manager {item.manager || "Unassigned"}</em>
                    {item.stage !== "closed" && item.followUp && <em>{item.followUp < today ? "Follow-up overdue" : "Follow up"} <time dateTime={item.followUp}>{item.followUp}</time></em>}
                  </span>
                  <span className="command-open">Open case</span>
                </button>
              </li>)}</ol>
            : reminderView ? <ol aria-label="GCC reminder results">{matchingReminders.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((reminder) =>
              <ReminderRow key={reminder.id} reminder={reminder} canAssign={canAssignReminder} onOpen={onOpenVehicle} onAssign={onAssignReminder} />)}</ol>
            : <ol>{matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((action) => {
            const { vehicle, status, next, owner, deadline, overdue } = action;
            return <li key={vehicle.row.vehicle_id}>
              <button onClick={() => onOpenVehicle(vehicle.row.vehicle_id)}>
                <span className={`command-priority-mark command-priority-${status === "Held" ? "critical" : status === "Ready for review" ? "ready" : "warning"}`} aria-hidden="true" />
                <span className="command-priority-copy"><b>{vehicleLabel(vehicle.row)} · {status}</b><small>{next}</small>
                  <em>{owner || "Needs assignment"} · {deadline ? `${overdue ? "Overdue" : "Due"} ${deadline.length > 10 ? new Date(deadline).toLocaleString() : deadline}` : "No deadline recorded"}</em></span>
                <span className="command-open">{vehicle.incident ? "Open damage case" : "Open vehicle"}</span>
              </button>
            </li>;
          })}</ol>}
          <div className="command-tools command-pages">
            <span role="status">{NUM.format(count)} results · {filterLabel}</span>
            <div className="flex gap-2"><button className="ops-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous actions</button>
              <button className="ops-button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next actions</button></div>
          </div>
        </section>

        <section className="command-recovery" aria-labelledby="recovery-pipeline-title">
          <header><div><Wrench size={18} weight="duotone" /><h3 id="recovery-pipeline-title">Damage recovery</h3></div><span>{NUM.format(summary.recoveryOpen)} tracked case{summary.recoveryOpen === 1 ? "" : "s"}</span></header>
          <ol>{RECOVERY_STAGES.map((stage, index) => <li key={stage.id} className={summary.recovery[stage.id] ? "has-work" : ""}>
            <button className="command-stage-action" aria-pressed={filter === stage.id} onClick={() => jumpToQueue(stage.id)}>
              <span className="command-stage-number" aria-hidden="true">{index + 1}</span><span><b>{stage.label}</b><small>{NUM.format(summary.recovery[stage.id])} cases</small></span>
            </button>
          </li>)}</ol>
          <button className="command-section-action" onClick={() => jumpToQueue("Damage cases")}>Show all damage cases</button>
        </section>

        <section className="command-compliance" aria-labelledby="gcc-evidence-title">
          <header><div><ShieldCheck size={18} weight="duotone" /><h3 id="gcc-evidence-title">GCC release evidence</h3></div></header>
          {regions.length ? <ul>{regions.slice(0, 7).map((item) => {
            const state = item.blocked ? "blocked" : item.unknown ? "unknown" : "ready";
            const word = item.blocked ? `${item.blocked} held` : item.unknown ? `${item.unknown} verify` : "Evidence clear";
            return <li key={item.region}><div><b>{item.region}</b><small>{NUM.format(item.ready)} of {NUM.format(item.total)} pass the applicable document checks</small></div><span className={`command-region-${state}`}>{word}{item.blocked && item.unknown ? ` / ${item.unknown} verify` : ""}</span></li>;
          })}</ul> : <div className="command-clear"><ShieldCheck size={21} /><div><b>No country evidence loaded</b><span>Import fleet regions and document dates to populate this review.</span></div></div>}
          {vehicles.some((vehicle) => !vehicle.row.gcc_country_code) && <p className="command-scope-note">Vehicles outside the GCC rule pack or with no region use the vehicle action queue.</p>}
          <Link className="command-section-action" href="/licence/">Review country rules and source confidence</Link>
        </section>
      </div>
      <footer><BellRinging size={15} /><span>FleetOps records actions and deadlines; it does not contact authorities, insurers or managers.</span></footer>
    </section>
  );
}
