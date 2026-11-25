"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { BellRinging, CheckCircle, ClipboardText, ShieldCheck, Siren, Wrench } from "@phosphor-icons/react";
import { commandActions, shiftHandoff, type ActionStatus } from "@/lib/garage-command";
import { downloadText } from "@/lib/exporters";
import {
  RECOVERY_STAGES,
  localDate,
  vehicleLabel,
  type GarageAlert,
  type GarageHandover,
  type GarageLane,
  type GarageVehicle,
  type RecoveryStage,
} from "@/lib/garage";

const NUM = new Intl.NumberFormat();
const PAGE_SIZE = 8;
const STATUS = ["Held", "Needs evidence", "Ready for review"] as const;
type Filter = "All actions" | ActionStatus | "Overdue damage" | "Damage cases" | RecoveryStage;

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
  vehicles, alerts, handovers, today, now, region, snapshot, demo, onOpenVehicle, onFilter, onOpenAlerts, onPractice,
}: {
  vehicles: GarageVehicle[];
  alerts: GarageAlert[];
  handovers: GarageHandover[];
  today: string;
  now: number;
  region: string;
  snapshot: string;
  demo: boolean;
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
  const select = (value: Filter) => { setFilter(value); setPage(0); };
  const jumpToQueue = (value: Filter) => {
    select(value);
    queue.current?.focus({ preventScroll: true });
    queue.current?.scrollIntoView({ block: "nearest" });
  };
  const q = search.trim().toLowerCase();
  const matches = actions.filter((action) => {
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
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
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
          <Link href="/doctrine/#SOP-09"><ClipboardText size={16} /> Damage SOP-09</Link>
          {onPractice && <button className="ops-button" onClick={onPractice}>Practice a damage case</button>}
          <button className="ops-button" disabled={!actions.length && !summary.handoversToday}
            onClick={() => {
              const at = Date.now();
              downloadText(`fleetops-shift-${localDate(new Date(at))}.txt`, shiftHandoff(commandActions(vehicles, at), handovers, region, snapshot, at, demo));
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
              <optgroup label="Damage stages">{RECOVERY_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</optgroup>
            </select></label>
            <label className="garage-field">Find vehicle or owner<input className="ops-input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
          </div>
          {matches.length ? <ol>{matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((action) => {
            const { vehicle, status, next, owner, deadline, overdue } = action;
            return <li key={vehicle.row.vehicle_id}>
              <button onClick={() => onOpenVehicle(vehicle.row.vehicle_id)}>
                <span className={`command-priority-mark command-priority-${status === "Held" ? "critical" : status === "Ready for review" ? "ready" : "warning"}`} aria-hidden="true" />
                <span className="command-priority-copy"><b>{vehicleLabel(vehicle.row)} · {status}</b><small>{next}</small>
                  <em>{owner || "Needs assignment"} · {deadline ? `${overdue ? "Overdue" : "Due"} ${deadline.length > 10 ? new Date(deadline).toLocaleString() : deadline}` : "No deadline recorded"}</em></span>
                <span className="command-open">{vehicle.incident ? "Open damage case" : "Open vehicle"}</span>
              </button>
            </li>;
          })}</ol> : <div className="command-clear"><CheckCircle size={21} weight="fill" /><div><b>No matching actions</b><span>Choose another queue or clear the search.</span></div></div>}
          <div className="command-tools command-pages">
            <span role="status">{NUM.format(matches.length)} results · {filterLabel}</span>
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
