import { CHECKS, damageStageBlockers, localDate, normaliseDamageCase, vehicleLabel,
  type GarageHandover, type GarageVehicle } from "./garage";

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
        owner: review.owner, deadline: review.due || renewal.date!, overdue: false });
      continue;
    }
    actions.push({ vehicle, status, next, owner: incident?.owner || review.owner, deadline: due, overdue });
  }
  const rank = { "Held": 0, "Needs evidence": 1, "Ready for review": 2, "Renewal due": 3 };
  return actions.sort((a, b) => Number(b.overdue) - Number(a.overdue) || rank[a.status] - rank[b.status] ||
    (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity) ||
    vehicleLabel(a.vehicle.row).localeCompare(vehicleLabel(b.vehicle.row)));
}

export function shiftHandoff(actions: CommandAction[], handovers: GarageHandover[], region: string, snapshot: string, now: number, demo: boolean) {
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
