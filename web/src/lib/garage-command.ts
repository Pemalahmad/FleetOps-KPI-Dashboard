import { CHECKS, damageStageBlockers, documentCurrent, localDate, normaliseDamageCase, vehicleLabel,
  type GarageHandover, type GarageState, type GarageVehicle } from "./garage";

export const REMINDER_LABELS = { registration: "Registration renewal", inspection: "Technical inspection" } as const;
type ReminderKind = keyof typeof REMINDER_LABELS;
export type ReminderStatus = "Overdue" | "Action needed" | "Due today" | "Upcoming";
export interface ComplianceReminder {
  id: string;
  kind: ReminderKind;
  vehicle: GarageVehicle;
  dueOn: string | null;
  status: ReminderStatus;
  owner: string;
  next: string;
}

function inspectionReminder(vehicle: GarageVehicle, today: string, registration: string | null, leadThrough: string):
  { dueOn: string | null; next: string } | null {
  const { row } = vehicle;
  const expiry = documentCurrent(row.inspection_expiry, today) === null ? null : row.inspection_expiry!.slice(0, 10);
  if (row.inspection_failed) {
    return { dueOn: null, next: "Record a passing reinspection." };
  }
  if (row.inspection_required_by_authority && (!expiry || expiry < today)) {
    return { dueOn: null, next: "Arrange the inspection required by the licensing authority." };
  }
  // Missing class or applicability data already has its own release evidence action.
  const bahrain = row.gcc_country_code === "BH";
  if (!row.registration_class || (bahrain ? !row.bahrain_registration_group : !row.registration_class_rule)) return null;
  if (row.inspection_applicability_gap && !(row.periodic_inspection && expiry)) return null;

  const start = row.inspection_starts_on?.slice(0, 10);
  const policyEnds = row.inspection_rule_until?.slice(0, 10);
  if (row.periodic_inspection) {
    const dueOn = start && expiry ? (start > expiry ? start : expiry) : start || expiry;
    if (dueOn && dueOn <= leadThrough) return { dueOn, next: "Book the periodic inspection and record the passing report." };
    if (!dueOn && vehicle.gates.some((gate) => gate.id === "gcc-inspection" && gate.status === "unknown")) {
      return { dueOn: null, next: "Arrange the required periodic inspection and confirm its due date." };
    }
    return null;
  }

  if (!registration || registration > leadThrough || (policyEnds && registration > policyEnds)) return null;
  if (bahrain && row.bahrain_registration_group === "private" && !row.inspection_required_by_authority) {
    const exemption = row.bahrain_inspection_after?.slice(0, 10);
    if (!exemption || registration <= exemption) return null;
  } else if (!row.inspection_required_by_authority && start && registration < start) return null;
  if (expiry && expiry >= today && expiry >= registration) return null;
  if (expiry && expiry >= today) {
    return { dueOn: expiry, next: "Renew while the inspection report is valid or book a new inspection." };
  }
  return { dueOn: registration, next: "Book the technical inspection before registration renewal." };
}

export function complianceReminders(vehicles: GarageVehicle[], owners: GarageState["reminderOwners"], today: string, leadDays: number): ComplianceReminder[] {
  const lead = new Date(today + "T00:00:00Z");
  if (!Number.isFinite(lead.getTime()) || !Number.isInteger(leadDays) || leadDays < 0) return [];
  lead.setUTCDate(lead.getUTCDate() + leadDays);
  if (!Number.isFinite(lead.getTime())) return [];
  const leadThrough = lead.toISOString().slice(0, 10);
  const reminders: ComplianceReminder[] = [];
  for (const vehicle of vehicles) {
    const { row } = vehicle;
    if (!row.is_active || !row.gcc_country_code) continue;
    const add = (kind: ReminderKind, dueOn: string | null, next: string) => {
      const id = `${kind}:${row.vehicle_id}`;
      const status = dueOn === null ? "Action needed" : dueOn < today ? "Overdue" : dueOn === today ? "Due today" : "Upcoming";
      reminders.push({ id, kind, vehicle, dueOn, status, owner: owners?.[id] ?? "", next });
    };
    const registration = documentCurrent(row.registration_expiry, today) === null ? null : row.registration_expiry!.slice(0, 10);
    if (registration && registration <= leadThrough) add("registration", registration, "Renew the registration and update its expiry.");
    const inspection = inspectionReminder(vehicle, today, registration, leadThrough);
    if (inspection) add("inspection", inspection.dueOn, inspection.next);
  }
  const rank: Record<ReminderStatus, number> = { Overdue: 0, "Action needed": 1, "Due today": 2, Upcoming: 3 };
  return reminders.sort((a, b) => rank[a.status] - rank[b.status] || (a.dueOn ?? "").localeCompare(b.dueOn ?? "") ||
    vehicleLabel(a.vehicle.row).localeCompare(vehicleLabel(b.vehicle.row)) || a.kind.localeCompare(b.kind));
}

export function setComplianceReminderOwner(state: GarageState, id: string, value: string): GarageState {
  const owner = value.trim().replace(/\s+/g, " ").slice(0, 120);
  if ((state.reminderOwners?.[id] ?? "") === owner) return state;
  const reminderOwners = { ...state.reminderOwners };
  if (owner) reminderOwners[id] = owner;
  else delete reminderOwners[id];
  return { ...state, reminderOwners };
}

export type ActionStatus = "Held" | "Needs evidence" | "Ready for review" | "Renewal due";
export interface CommandAction {
  vehicle: GarageVehicle;
  status: ActionStatus;
  next: string;
  owner: string;
  deadline: string;
  overdue: boolean;
}

export function commandActions(vehicles: GarageVehicle[], now: number): CommandAction[] {
  const actions: CommandAction[] = [];
  for (const vehicle of vehicles) {
    const { incident, row, review, gates } = vehicle;
    const notifications = incident ? Object.entries(normaliseDamageCase(incident).notifications)
      .filter(([, note]) => note.required && note.status !== "sent")
      .sort(([, a], [, b]) => (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity)) : [];
    const upcoming = notifications[0];
    const due = upcoming?.[1].dueAt || review.due;
    const overdue = Boolean(upcoming?.[1].dueAt && Date.parse(upcoming[1].dueAt) <= now);
    const failed = gates.find((gate) => gate.status === "blocked") ?? gates.find((gate) => gate.status === "unknown");
    const collision = !incident && row.collision_jobs > 0;
    const inRecovery = incident && incident.stage !== "ready";
    const stageBlocker = incident && damageStageBlockers(incident)[0];
    let status: ActionStatus;
    let next: string;
    if (overdue && upcoming) {
      status = "Held";
      next = `Escalate overdue ${upcoming[0]} notification`;
    } else if (collision || inRecovery) {
      status = "Held";
      next = collision ? "Open an SOP-09 case for the imported collision" : stageBlocker ||
        (upcoming ? `Record the ${upcoming[0]} notification` : "Review the case and advance recovery");
    } else if (failed || stageBlocker || upcoming) {
      status = failed?.status === "blocked" || incident ? "Held" : "Needs evidence";
      next = stageBlocker || (upcoming ? `Record the ${upcoming[0]} notification` : failed!.detail);
    } else if (!vehicle.released && (vehicle.lane === "dispatch" || incident)) {
      status = "Ready for review";
      next = "Complete release review and record the handover";
    } else {
      const renewals = [
        { label: "registration", date: row.registration_status === "Expiring" ? row.registration_expiry : null },
        { label: "insurance", date: row.insurance_status === "Expiring" ? row.insurance_expiry : null },
      ].filter((item) => item.date).sort((a, b) => a.date!.localeCompare(b.date!));
      const renewal = renewals[0];
      if (!renewal) continue;
      actions.push({ vehicle, status: "Renewal due", next: `Start ${renewal.label} renewal before expiry`,
        owner: review.owner, deadline: renewal.date!, overdue: false });
      continue;
    }
    actions.push({ vehicle, status, next, owner: incident?.owner || review.owner, deadline: due, overdue });
  }
  const rank = { "Held": 0, "Needs evidence": 1, "Ready for review": 2, "Renewal due": 3 };
  return actions.sort((a, b) => Number(b.overdue) - Number(a.overdue) || rank[a.status] - rank[b.status] ||
    (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity) ||
    vehicleLabel(a.vehicle.row).localeCompare(vehicleLabel(b.vehicle.row)));
}

export function shiftHandoff(actions: CommandAction[], handovers: GarageHandover[], region: string, snapshot: string, now: number, demo: boolean,
  reminders: ComplianceReminder[] = []) {
  const today = localDate(new Date(now));
  const recorded = handovers.filter((handover) => localDate(new Date(handover.at)) === today);
  return [
    demo ? "FleetOps shift handoff (synthetic demo)" : "FleetOps shift handoff",
    `Scope: ${region} | Prepared: ${new Date(now).toISOString()} | Source report: ${snapshot}`,
    "", `Open actions: ${actions.length}`,
    ...actions.map(({ vehicle, status, next, owner, deadline, overdue }) => [
      `${vehicleLabel(vehicle.row)} [${vehicle.row.vehicle_id}] | ${status} | ${next}`,
      `Owner: ${owner || "Needs assignment"} | Deadline: ${deadline || "Not recorded"}${overdue ? " (overdue)" : ""}`,
    ].join("\n")),
    "", `GCC reminders: ${reminders.length}`,
    ...reminders.flatMap(({ vehicle, kind, dueOn, status, owner, next }) => [
      `${vehicleLabel(vehicle.row)} [${vehicle.row.vehicle_id}] | ${vehicle.row.gcc_country} | ${REMINDER_LABELS[kind]} | ${status}`,
      `Owner: ${owner || "Unassigned"} | Due: ${dueOn ?? "Action needed now"} | ${next}`,
    ]),
    "", `Handovers recorded today: ${recorded.length}`,
    ...recorded.map((handover) => `${handover.vehicleId} | ${handover.reviewer} | ${handover.at}`),
  ].join("\n");
}

export function releaseRecord(handover: GarageHandover, label: string, demo: boolean): string {
  const damage = handover.damageSnapshot;
  return [
    demo ? "FleetOps practice release record (synthetic demo)" : "FleetOps recorded vehicle handover",
    `Vehicle: ${label} [${handover.vehicleId}]`,
    `Recorded: ${handover.at} | Reviewer: ${handover.reviewer} | Source report: ${handover.snapshot}`,
    `Country rule scope: ${handover.countryScope ?? "Not recorded in this historical handover"}`,
    "", "Recorded source checks",
    ...handover.source.flatMap((gate) => [
      `${gate.label} | ${gate.status} | ${gate.detail}`,
      ...(gate.rule ? [`  ${gate.rule.authority} | ${gate.rule.source} | Checked ${gate.rule.checkedOn} | Confidence: ${gate.rule.confidence}`] : []),
    ]),
    "", "Reviewer checks",
    ...CHECKS.map((check) => `${check.label}: ${handover.review.checks[check.id] ? "Signed off" : "Not recorded"}`),
    ...(damage ? ["", `SOP-09 case: ${handover.incidentIds.join(", ")}`,
      `Hold placed: ${damage.hold.placedAt} | Handover recorded: ${handover.at}`,
      ...Object.entries(damage.notifications).map(([kind, note]) => {
        const late = note.status === "sent" && Date.parse(note.sentAt) > Date.parse(note.dueAt);
        return `${kind}: ${note.status}${late ? " (completed late)" : ""} | due ${note.dueAt || "n/a"} | source ${note.deadlineSource || "not recorded"} | completed ${note.sentAt || "n/a"} | ${note.notifiedBy} ${note.reference || note.waiverReason}`;
      }),
      ...Object.entries(damage.evidence).filter(([, evidence]) => evidence.complete).map(([kind, evidence]) => `${kind}: ${evidence.reference}`),
      `Estimate: ${damage.estimate.reference} | Approval: ${damage.authorization.reference} (${damage.authorization.approvedBy})`,
      `Repair: ${damage.repair.workOrder} | Invoice: ${damage.repair.invoiceReference} | Completion: ${damage.repair.completionReference}`,
      `Quality: ${damage.quality.reference} | Reviewer: ${damage.quality.reviewer} | ${damage.quality.reviewedAt}`,
    ] : []),
    "", "This file records the operator’s review of the evidence available at handover.",
  ].join("\n");
}
