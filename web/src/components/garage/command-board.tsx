"use client";

import Link from "next/link";
import { BellRinging, CheckCircle, ClipboardText, ShieldCheck, Siren, Wrench } from "@phosphor-icons/react";
import {
  RECOVERY_STAGES,
  localDate,
  normaliseDamageCase,
  type GarageAlert,
  type GarageHandover,
  type GarageLane,
  type GarageVehicle,
  type RecoveryStage,
} from "@/lib/garage";

const NUM = new Intl.NumberFormat();

export interface CommandSummary {
  critical: number;
  overdueDamage: number;
  incidentHolds: number;
  renewals: number;
  dispatchReady: number;
  handoversToday: number;
  recoveryOpen: number;
  recovery: Record<RecoveryStage, number>;
}

export function buildCommandSummary(vehicles: GarageVehicle[], alerts: GarageAlert[], handovers: GarageHandover[], today: string): CommandSummary {
  const recovery = Object.fromEntries(RECOVERY_STAGES.map((stage) => [stage.id, 0])) as Record<RecoveryStage, number>;
  for (const vehicle of vehicles) if (vehicle.incident) recovery[vehicle.incident.stage] += 1;
  return {
    critical: alerts.filter((alert) => alert.priority === "critical").length,
    overdueDamage: alerts.filter((alert) => alert.id.startsWith("damage-overdue:")).length,
    incidentHolds: vehicles.filter((vehicle) => vehicle.lane === "incident").length,
    renewals: vehicles.filter((vehicle) => vehicle.lane === "renewal").length,
    dispatchReady: vehicles.filter((vehicle) => vehicle.lane === "dispatch").length,
    handoversToday: handovers.filter((handover) => localDate(new Date(handover.at)) === today).length,
    recoveryOpen: Object.values(recovery).reduce((total, count) => total + count, 0),
    recovery,
  };
}

interface RegionStatus { region: string; total: number; blocked: number; unknown: number; ready: number }

function regionStatuses(vehicles: GarageVehicle[]): RegionStatus[] {
  const result = new Map<string, RegionStatus>();
  for (const vehicle of vehicles) {
    const region = vehicle.row.region?.trim() || "Region not recorded";
    const entry = result.get(region) ?? { region, total: 0, blocked: 0, unknown: 0, ready: 0 };
    const documentGates = vehicle.gates.filter((gate) => gate.id === "registration" || gate.id === "insurance");
    entry.total += 1;
    if (documentGates.some((gate) => gate.status === "blocked")) entry.blocked += 1;
    else if (documentGates.some((gate) => gate.status === "unknown")) entry.unknown += 1;
    else entry.ready += 1;
    result.set(region, entry);
  }
  return [...result.values()].sort((a, b) => b.blocked - a.blocked || b.unknown - a.unknown || a.region.localeCompare(b.region));
}

function deadline(vehicle: GarageVehicle | undefined) {
  if (!vehicle?.incident) return null;
  const notifications = Object.values(normaliseDamageCase(vehicle.incident).notifications)
    .filter((item) => item.required && item.status !== "sent" && Number.isFinite(Date.parse(item.dueAt)))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  if (!notifications.length) return null;
  return new Date(notifications[0].dueAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CommandMetric({ value, label, tone = "ink", onClick }: { value: number; label: string; tone?: "ink" | "bad" | "warn" | "good"; onClick?: () => void }) {
  const content = <><b className={`tnum command-metric-value command-tone-${tone}`}>{NUM.format(value)}</b><span>{label}</span></>;
  return onClick ? <button className="command-metric" onClick={onClick}>{content}</button> : <div className="command-metric">{content}</div>;
}

export function DailyCommandBoard({
  vehicles, alerts, handovers, today, onOpenVehicle, onFilter, onOpenAlerts,
}: {
  vehicles: GarageVehicle[];
  alerts: GarageAlert[];
  handovers: GarageHandover[];
  today: string;
  onOpenVehicle: (vehicleId: string) => void;
  onFilter: (lane: GarageLane) => void;
  onOpenAlerts: () => void;
}) {
  const summary = buildCommandSummary(vehicles, alerts, handovers, today);
  const regions = regionStatuses(vehicles);
  const actionRank = (alert: GarageAlert) => alert.id.startsWith("damage-overdue:") ? 0
    : alert.id.startsWith("incident:") ? 1 : alert.id.startsWith("collision:") ? 2
      : alert.priority === "critical" ? 3 : alert.priority === "ready" ? 4 : 5;
  const priority = [...alerts].sort((a, b) => actionRank(a) - actionRank(b) || a.title.localeCompare(b.title)).slice(0, 6);
  return (
    <section className="garage-command" aria-label="Daily fleet command">
      <header className="garage-command-head">
        <div>
          <p className="command-kicker"><span aria-hidden="true" /> Daily operating review</p>
          <h2 id="daily-command-title">Work the exceptions first</h2>
          <p>Safety and legal holds, damage deadlines and handovers that need an owner today.</p>
        </div>
        <div className="garage-command-links">
          <Link href="/licence/"><ShieldCheck size={16} /> GCC rules and evidence</Link>
          <Link href="/doctrine/#SOP-09"><ClipboardText size={16} /> Damage SOP-09</Link>
        </div>
      </header>

      <div className="command-rail" aria-label="Today at a glance">
        <CommandMetric value={summary.critical} label="Critical holds" tone={summary.critical ? "bad" : "good"} onClick={onOpenAlerts} />
        <CommandMetric value={summary.overdueDamage} label="Damage deadlines overdue" tone={summary.overdueDamage ? "bad" : "good"} onClick={() => onFilter("incident")} />
        <CommandMetric value={summary.incidentHolds} label="Accident holds" tone={summary.incidentHolds ? "bad" : "good"} onClick={() => onFilter("incident")} />
        <CommandMetric value={summary.renewals} label="Renewal desk" tone={summary.renewals ? "warn" : "good"} onClick={() => onFilter("renewal")} />
        <CommandMetric value={summary.dispatchReady} label="Ready for dispatch review" tone="ink" onClick={() => onFilter("dispatch")} />
        <CommandMetric value={summary.handoversToday} label="Handovers recorded today" tone="good" />
      </div>

      <div className="command-workspace">
        <section className="command-priority" aria-labelledby="priority-actions-title">
          <header><div><Siren size={18} weight="duotone" /><h3 id="priority-actions-title">Priority actions</h3></div><button onClick={onOpenAlerts}>Open alert inbox</button></header>
          {priority.length ? <ol>{priority.map((alert) => {
            const vehicle = vehicles.find((item) => item.row.vehicle_id === alert.vehicleId);
            const owner = vehicle?.incident?.owner || (alert.priority === "critical" ? "Safety and compliance" : "Fleet operations");
            const due = deadline(vehicle);
            return <li key={alert.id}>
              <button onClick={() => onOpenVehicle(alert.vehicleId)}>
                <span className={`command-priority-mark command-priority-${alert.priority}`} aria-hidden="true" />
                <span className="command-priority-copy"><b>{alert.title}</b><small>{alert.detail}</small><em>{owner}{due ? ` · deadline ${due}` : ""}</em></span>
                <span className="command-open">Open vehicle</span>
              </button>
            </li>;
          })}</ol> : <div className="command-clear"><CheckCircle size={21} weight="fill" /><div><b>No priority exceptions</b><span>The loaded evidence has no open alert requiring action.</span></div></div>}
        </section>

        <section className="command-recovery" aria-labelledby="recovery-pipeline-title">
          <header><div><Wrench size={18} weight="duotone" /><h3 id="recovery-pipeline-title">Damage recovery</h3></div><span>{NUM.format(summary.recoveryOpen)} tracked case{summary.recoveryOpen === 1 ? "" : "s"}</span></header>
          <ol>{RECOVERY_STAGES.map((stage, index) => <li key={stage.id} className={summary.recovery[stage.id] ? "has-work" : ""}>
            <span className="command-stage-number">{index + 1}</span><span><b>{stage.label}</b><small>{summary.recovery[stage.id] ? `${NUM.format(summary.recovery[stage.id])} vehicle${summary.recovery[stage.id] === 1 ? "" : "s"}` : "Clear"}</small></span>
          </li>)}</ol>
          <button className="command-section-action" onClick={() => onFilter("incident")}>Open accident queue</button>
        </section>

        <section className="command-compliance" aria-labelledby="gcc-evidence-title">
          <header><div><ShieldCheck size={18} weight="duotone" /><h3 id="gcc-evidence-title">GCC evidence status</h3></div><span>Registration and insurance</span></header>
          {regions.length ? <ul>{regions.slice(0, 7).map((item) => {
            const state = item.blocked ? "blocked" : item.unknown ? "unknown" : "ready";
            const word = item.blocked ? `${item.blocked} held` : item.unknown ? `${item.unknown} verify` : "Evidence clear";
            return <li key={item.region}><div><b>{item.region}</b><small>{NUM.format(item.ready)} of {NUM.format(item.total)} clear</small></div><span className={`command-region-${state}`}>{word}</span></li>;
          })}</ul> : <div className="command-clear"><ShieldCheck size={21} /><div><b>No country evidence loaded</b><span>Import fleet regions and document dates to populate this review.</span></div></div>}
          <Link className="command-section-action" href="/licence/">Review country rules and source confidence</Link>
        </section>
      </div>
      <footer><BellRinging size={15} /><span>FleetOps records actions and deadlines; it does not contact authorities, insurers or managers.</span></footer>
    </section>
  );
}
