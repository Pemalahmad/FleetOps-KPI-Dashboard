import type { ComplianceEscalation } from "./garage-escalations";
import type { EhsCase } from "./ehs";

/** Garage rules: source evidence is separate from recorded operational work. */
export type GarageLane = "road" | "repair" | "renewal" | "incident" | "dispatch" | "verify";
export type RecoveryStage = "reported" | "assessment" | "repair" | "quality" | "ready";
export type PaperworkStage = "not_started" | "submitted" | "received";
export type CheckId = "walkaround" | "road_test" | "handover";
export type DamageSeverity = "unclassified" | "minor" | "moderate" | "major" | "critical";
export type DamageDrivability = "unknown" | "drivable" | "not_drivable";
export type DamageNotificationKind = "police" | "insurer" | "management";
export type DamageNotificationStatus = "pending" | "sent" | "not_required";
export type DamageEvidenceId = "scene_photos" | "vehicle_photos" | "driver_statement" | "third_party_details" | "police_reference" | "insurer_reference" | "estimate" | "repair_completion" | "quality_record";
export type DamageQualityCheckId = "scope_complete" | "safety_defects_clear" | "warning_lights_clear" | "road_or_functional_test" | "final_photos";
export interface DamageEvidence { required: boolean; complete: boolean; reference: string; recordedAt: string }
export interface DamageNotification {
  required: boolean; status: DamageNotificationStatus; dueAt: string; sentAt: string;
  notifiedBy: string; reference: string; waiverReason: string; deadlineSource?: string;
}
export interface DamageHistoryEntry { id: string; at: string; actor: string; action: string; detail: string }
export interface DamageCase {
  severity: DamageSeverity; drivability: DamageDrivability;
  facts: { injuryOrEmergency: boolean; thirdParty: boolean; publicProperty: boolean; towRequired: boolean };
  hold: { active: boolean; reason: string; placedAt: string; releasedAt: string };
  evidence: Record<DamageEvidenceId, DamageEvidence>;
  notifications: Record<DamageNotificationKind, DamageNotification>;
  estimate: { supplier: string; currency: string; amount: number | null; reference: string; receivedAt: string };
  authorization: { status: "pending" | "approved" | "rejected"; approvedBy: string; decidedAt: string; reference: string; reason: string };
  repair: { supplier: string; workOrder: string; startedAt: string; completedAt: string; invoiceReference: string; completionReference: string };
  quality: { reviewer: string; reviewedAt: string; checks: Record<DamageQualityCheckId, boolean>; reference: string };
  history: DamageHistoryEntry[];
}
export interface GarageIncident {
  id: string; vehicleId: string; summary: string; owner: string; occurredAt: string;
  stage: RecoveryStage; createdAt: string; updatedAt: string; resolvedAt?: string;
  damage?: DamageCase;
}
export interface GarageReview {
  revision: string; owner: string; due: string; notes: string; updatedAt: string;
  checks: Record<CheckId, boolean>;
  paperwork: { registration: PaperworkStage; insurance: PaperworkStage };
}
export interface GarageHandover {
  id: string; vehicleId: string; revision: string; reviewer: string; at: string;
  incidentIds: string[]; snapshot: string;
  review: GarageReview; source: ReadinessGate[];
  countryScope?: string;
  damageSnapshot?: DamageCase;
}
export interface GarageState {
  version: 1; incidents: GarageIncident[]; reviews: Record<string, GarageReview>;
  acknowledged: string[]; handovers: GarageHandover[];
  reminderOwners?: Record<string, string>;
  complianceEscalations?: ComplianceEscalation[];
  ehsCases?: EhsCase[];
  reviewHistory?: { vehicleId: string; review: GarageReview; archivedAt: string; reason: string }[];
}
export const emptyGarage = (): GarageState => ({ version: 1, incidents: [], reviews: {}, acknowledged: [], handovers: [], reviewHistory: [] });
export interface GarageRow {
  vehicle_id: string; plate_number: string | null; make: string | null; model: string | null;
  model_year: number | null; powertrain: string | null; color: string | null; region: string | null;
  home_site_name: string | null; is_active: boolean;
  registration_status: string; registration_expiry: string | null; registration_days_left: number | null;
  insurance_status: string; insurance_expiry: string | null; insurance_days_left: number | null;
  insurer: string | null; open_jobs: number; unfinished_jobs: number; collision_jobs: number;
  ready_jobs: number; work_order_id: string | null; job_type: string | null;
  opened_at: string | null; key_in_at: string | null; ready_at: string | null;
  key_out_at: string | null; closed_at: string | null; back_in_service_at: string | null;
  repair_revision: string | null; pm_state: string | null; has_usage: boolean; usage_end: string | null; open_recalls: number;
  gcc_assessed: boolean; gcc_country_code: string | null; gcc_country: string | null;
  gcc_authority: string | null; gcc_source_url: string | null; gcc_confidence: string | null;
  operating_card_required: boolean | null; permit_expiry: string | null;
  insurance_covers_registration: boolean | null; inspection_review_from: string | null;
  inspection_expiry: string | null;
  registration_class: string | null; bahrain_registration_group: "private" | "other" | null;
  bahrain_inspection_after: string | null; inspection_required_by_authority: boolean | null;
  registration_class_rule: string | null; inspection_starts_on: string | null; inspection_applicability_gap: string | null;
  periodic_inspection: boolean | null; inspection_schedule_reference: string | null;
  inspection_rule_until: string | null; inspection_source_url: string | null;
  inspection_failed: boolean | null; inspection_failed_on: string | null;
  first_registered: string | null; manufacture_date: string | null; registered_as_new: boolean | null;
  registration_jurisdiction: string | null; registration_owner_type: string | null;
  registration_weight_kg: number | null; vehicle_advertising: boolean | null;
}
export interface GarageContext {
  snapshot: string; today: string; demo: boolean; operations: boolean; recallCoverage: boolean;
}
export interface ReadinessGate { id: string; label: string; status: "pass" | "blocked" | "unknown"; detail: string; href: string; rule?: { authority: string; source: string; confidence: string; checkedOn: string } }
export interface GarageVehicle {
  row: GarageRow; lane: GarageLane; gates: ReadinessGate[]; incident: GarageIncident | null;
  review: GarageReview; revision: string; sourceClear: boolean; released: boolean; handoverRecorded: boolean; readiness: number;
  blockers: string[]; milestones: { label: string; at: string | null }[];
}
export const RECOVERY_STAGES: { id: RecoveryStage; label: string }[] = [
  { id: "reported", label: "Reported" }, { id: "assessment", label: "Assessment" },
  { id: "repair", label: "Repair" }, { id: "quality", label: "Quality checks" }, { id: "ready", label: "Ready for review" },
];
export const CHECKS: { id: CheckId; label: string; detail: string }[] = [
  { id: "walkaround", label: "Safety walkaround", detail: "Tyres, lights, fluids, warning indicators and visible damage checked." },
  { id: "road_test", label: "Repair / road test signed off", detail: "A competent reviewer confirms the required repair checks and test." },
  { id: "handover", label: "Keys and dispatch handover", detail: "Driver or dispatcher, keys, documents and next service confirmed." },
];
export const DAMAGE_EVIDENCE: DamageEvidenceId[] = ["scene_photos", "vehicle_photos", "driver_statement", "third_party_details", "police_reference", "insurer_reference", "estimate", "repair_completion", "quality_record"];
export const DAMAGE_QUALITY_CHECKS: DamageQualityCheckId[] = ["scope_complete", "safety_defects_clear", "warning_lights_clear", "road_or_functional_test", "final_photos"];
const DAMAGE_NOTIFICATIONS: DamageNotificationKind[] = ["police", "insurer", "management"];

const validTimestamp = (value: string) => Boolean(value) && Number.isFinite(Date.parse(value));
const copyDamage = (damage: DamageCase): DamageCase => JSON.parse(JSON.stringify(damage)) as DamageCase;
const emptyEvidence = (): Record<DamageEvidenceId, DamageEvidence> => Object.fromEntries(DAMAGE_EVIDENCE.map((id) => [id, { required: false, complete: false, reference: "", recordedAt: "" }])) as Record<DamageEvidenceId, DamageEvidence>;
const emptyNotifications = (): Record<DamageNotificationKind, DamageNotification> => Object.fromEntries(DAMAGE_NOTIFICATIONS.map((id) => [id, { required: id === "management", status: "pending", dueAt: "", sentAt: "", notifiedBy: "", reference: "", waiverReason: "" }])) as Record<DamageNotificationKind, DamageNotification>;
export function createDamageCase(at: string, actor = ""): DamageCase {
  return {
    severity: "unclassified", drivability: "unknown",
    facts: { injuryOrEmergency: false, thirdParty: false, publicProperty: false, towRequired: false },
    hold: { active: true, reason: "Pending damage assessment and controlled release", placedAt: at, releasedAt: "" },
    evidence: emptyEvidence(), notifications: emptyNotifications(),
    estimate: { supplier: "", currency: "", amount: null, reference: "", receivedAt: "" },
    authorization: { status: "pending", approvedBy: "", decidedAt: "", reference: "", reason: "" },
    repair: { supplier: "", workOrder: "", startedAt: "", completedAt: "", invoiceReference: "", completionReference: "" },
    quality: { reviewer: "", reviewedAt: "", checks: Object.fromEntries(DAMAGE_QUALITY_CHECKS.map((id) => [id, false])) as Record<DamageQualityCheckId, boolean>, reference: "" },
    history: [{ id: `reported:${at}`, at, actor, action: "Damage reported", detail: "Vehicle placed on an operational hold." }],
  };
}
/** Safely upgrades a legacy v1 incident without weakening any release gate. */
export function normaliseDamageCase(incident: Pick<GarageIncident, "damage" | "createdAt" | "owner">): DamageCase {
  const base = createDamageCase(incident.createdAt, incident.owner), saved = incident.damage;
  if (!saved) return base;
  const merged: DamageCase = {
    ...base, ...saved,
    facts: { ...base.facts, ...saved.facts }, hold: { ...base.hold, ...saved.hold },
    evidence: Object.fromEntries(DAMAGE_EVIDENCE.map((id) => [id, { ...base.evidence[id], ...saved.evidence?.[id] }])) as DamageCase["evidence"],
    notifications: Object.fromEntries(DAMAGE_NOTIFICATIONS.map((id) => [id, { ...base.notifications[id], ...saved.notifications?.[id] }])) as DamageCase["notifications"],
    estimate: { ...base.estimate, ...saved.estimate }, authorization: { ...base.authorization, ...saved.authorization },
    repair: { ...base.repair, ...saved.repair }, quality: { ...base.quality, ...saved.quality, checks: { ...base.quality.checks, ...saved.quality?.checks } },
    history: Array.isArray(saved.history) ? saved.history.map((entry) => ({ ...entry })) : base.history,
  };
  const { police: policeRequired, insurer: insurerRequired } = requiredDamageNotifications(merged.facts, merged.severity);
  if (policeRequired) { merged.notifications.police.required = true; if (merged.notifications.police.status === "not_required") merged.notifications.police.status = "pending"; }
  if (insurerRequired) { merged.notifications.insurer.required = true; if (merged.notifications.insurer.status === "not_required") merged.notifications.insurer.status = "pending"; }
  merged.notifications.management.required = true;
  const requiredEvidence: DamageEvidenceId[] = ["scene_photos", "vehicle_photos", "driver_statement", "estimate", "repair_completion", "quality_record"];
  if (merged.facts.thirdParty || merged.facts.publicProperty) requiredEvidence.push("third_party_details");
  if (merged.notifications.police.required) requiredEvidence.push("police_reference");
  if (merged.notifications.insurer.required) requiredEvidence.push("insurer_reference");
  for (const id of DAMAGE_EVIDENCE) merged.evidence[id].required = requiredEvidence.includes(id);
  return merged;
}

export function requiredDamageNotifications(facts: DamageCase["facts"], severity: DamageSeverity) {
  const thirdPartyRisk = facts.thirdParty || facts.publicProperty || facts.towRequired;
  return {
    police: facts.injuryOrEmergency || thirdPartyRisk || severity === "major" || severity === "critical",
    insurer: thirdPartyRisk || severity === "moderate" || severity === "major" || severity === "critical",
    management: true,
  };
}

function commonDamageBlockers(damage: DamageCase): string[] {
  const blockers: string[] = [];
  if (damage.severity === "unclassified") blockers.push("Classify damage severity.");
  if (damage.drivability === "unknown") blockers.push("Record whether the vehicle is drivable.");
  if (!damage.hold.active) blockers.push("The vehicle damage hold must remain active until handover.");
  if (!damage.hold.reason.trim()) blockers.push("Record the operational hold reason.");
  if (!validTimestamp(damage.hold.placedAt)) blockers.push("Record a valid hold placement time.");
  if (damage.estimate.amount !== null && (!Number.isFinite(damage.estimate.amount) || damage.estimate.amount < 0)) blockers.push("Estimate amount must be a non-negative finite number.");
  if (damage.estimate.amount !== null && !/^[A-Z]{3}$/.test(damage.estimate.currency)) blockers.push("Estimate currency must be a three-letter code.");
  for (const kind of DAMAGE_NOTIFICATIONS) {
    const note = damage.notifications[kind];
    if (note.required && note.status === "not_required") blockers.push(`${kind} notification cannot be waived for the recorded facts.`);
    if (note.required && !validTimestamp(note.dueAt)) blockers.push(`Record the ${kind} notification deadline.`);
    if (note.required && !note.deadlineSource?.trim()) blockers.push(`Record the source of the ${kind} deadline.`);
    if (!note.required && note.status !== "not_required") blockers.push(`Record why ${kind} notification is not required.`);
    if (note.status === "not_required" && !note.waiverReason.trim()) blockers.push(`Record the rationale for no ${kind} notification.`);
    if (note.status === "sent" && (!validTimestamp(note.sentAt) || !note.notifiedBy.trim() || !note.reference.trim())) blockers.push(`Record when, by whom and under which reference the ${kind} notification was made.`);
  }
  return blockers;
}
function damageRecordErrors(damage: DamageCase): string[] {
  const errors: string[] = [];
  const timestamps: [string, string][] = [
    ["hold placement", damage.hold.placedAt], ["hold release", damage.hold.releasedAt],
    ["estimate receipt", damage.estimate.receivedAt], ["authorization decision", damage.authorization.decidedAt],
    ["repair start", damage.repair.startedAt], ["repair completion", damage.repair.completedAt], ["quality review", damage.quality.reviewedAt],
    ...DAMAGE_NOTIFICATIONS.flatMap((kind): [string, string][] => [[`${kind} deadline`, damage.notifications[kind].dueAt], [`${kind} completion`, damage.notifications[kind].sentAt]]),
    ...DAMAGE_EVIDENCE.map((id): [string, string] => [`${id} evidence`, damage.evidence[id].recordedAt]),
  ];
  for (const [label, value] of timestamps) if (value && !validTimestamp(value)) errors.push(`Use a valid ${label} time.`);
  if (damage.estimate.amount !== null && (!Number.isFinite(damage.estimate.amount) || damage.estimate.amount < 0)) errors.push("Estimate amount must be a non-negative finite number.");
  if (damage.estimate.amount !== null && !/^[A-Z]{3}$/.test(damage.estimate.currency)) errors.push("Estimate currency must be a three-letter code.");
  if (damage.authorization.status === "approved" && (damage.estimate.amount === null || !damage.estimate.reference.trim() || !validTimestamp(damage.estimate.receivedAt))) errors.push("An approval requires a complete received estimate.");
  if (damage.authorization.status === "approved" && validTimestamp(damage.authorization.decidedAt) && Date.parse(damage.authorization.decidedAt) < Date.parse(damage.estimate.receivedAt)) errors.push("Approval cannot precede the estimate.");
  if (validTimestamp(damage.repair.startedAt) && (!validTimestamp(damage.authorization.decidedAt) || damage.authorization.status !== "approved" || Date.parse(damage.repair.startedAt) < Date.parse(damage.authorization.decidedAt))) errors.push("Repair start requires an earlier approval.");
  if (damage.repair.completedAt && (!validTimestamp(damage.repair.startedAt) || Date.parse(damage.repair.completedAt) < Date.parse(damage.repair.startedAt))) errors.push("Repair completion cannot precede repair start.");
  if (damage.quality.reviewedAt && (!validTimestamp(damage.repair.completedAt) || Date.parse(damage.quality.reviewedAt) < Date.parse(damage.repair.completedAt))) errors.push("Quality review cannot precede repair completion.");
  for (const kind of DAMAGE_NOTIFICATIONS) {
    const note = damage.notifications[kind];
    if (note.status === "sent" && (!validTimestamp(note.sentAt) || !note.notifiedBy.trim() || !note.reference.trim())) errors.push(`Record when, by whom and under which reference the ${kind} notification was made.`);
    if (note.status === "not_required" && !note.waiverReason.trim()) errors.push(`Record the rationale for no ${kind} notification.`);
  }
  return [...new Set(errors)];
}
export function damageStageBlockers(incident: GarageIncident): string[] {
  const damage = normaliseDamageCase(incident), blockers = commonDamageBlockers(damage);
  const stage = RECOVERY_STAGES.findIndex((item) => item.id === incident.stage);
  if (stage >= 1) {
    for (const id of DAMAGE_EVIDENCE.filter((id) => damage.evidence[id].required && !["repair_completion", "quality_record"].includes(id))) {
      const evidence = damage.evidence[id];
      if (!evidence.complete || !evidence.reference.trim() || !validTimestamp(evidence.recordedAt)) blockers.push(`Complete required evidence: ${id.replaceAll("_", " ")}.`);
    }
    for (const kind of DAMAGE_NOTIFICATIONS) if (damage.notifications[kind].required && damage.notifications[kind].status !== "sent") blockers.push(`Record the required ${kind} notification before repair.`);
    if (!damage.estimate.supplier.trim() || damage.estimate.amount === null || !damage.estimate.reference.trim() || !validTimestamp(damage.estimate.receivedAt)) blockers.push("Record the supplier, amount, reference and receipt time for the estimate.");
    if (damage.authorization.status !== "approved" || !damage.authorization.approvedBy.trim() || !validTimestamp(damage.authorization.decidedAt) || !damage.authorization.reference.trim()) blockers.push("Record approved repair authorization with approver, time and reference.");
  }
  if (stage >= 2) {
    if (!damage.repair.supplier.trim() || !damage.repair.workOrder.trim() || !validTimestamp(damage.repair.startedAt) || !validTimestamp(damage.repair.completedAt) || !damage.repair.invoiceReference.trim() || !damage.repair.completionReference.trim()) blockers.push("Record the repair supplier, work order, dates, invoice and completion evidence.");
    if (validTimestamp(damage.repair.startedAt) && validTimestamp(damage.repair.completedAt) && Date.parse(damage.repair.completedAt) < Date.parse(damage.repair.startedAt)) blockers.push("Repair completion cannot precede repair start.");
    const evidence = damage.evidence.repair_completion;
    if (!evidence.complete || !evidence.reference.trim() || !validTimestamp(evidence.recordedAt)) blockers.push("Record repair completion evidence.");
  }
  if (stage >= 3) {
    if (!validTimestamp(damage.repair.completedAt)) blockers.push("Repair must be completed before quality review.");
    if (!damage.quality.reviewer.trim() || !validTimestamp(damage.quality.reviewedAt) || !damage.quality.reference.trim()) blockers.push("Record the quality reviewer, review time and reference.");
    for (const id of DAMAGE_QUALITY_CHECKS) if (!damage.quality.checks[id]) blockers.push(`Complete quality check: ${id.replaceAll("_", " ")}.`);
    const evidence = damage.evidence.quality_record;
    if (!evidence.complete || !evidence.reference.trim() || !validTimestamp(evidence.recordedAt)) blockers.push("Record quality review evidence.");
  }
  return [...new Set(blockers)];
}
export function damageHandoverBlockers(incident: GarageIncident, at: string): string[] {
  const damage = normaliseDamageCase(incident);
  const blockers = [...damageStageBlockers({ ...incident, stage: "quality" }), ...damageRecordErrors(damage)];
  if (incident.stage !== "ready") blockers.push("Accident recovery must reach Ready for review.");
  for (const kind of DAMAGE_NOTIFICATIONS) {
    const note = damage.notifications[kind];
    if (note.required && note.status !== "sent") blockers.push(`The required ${kind} notification is still pending.`);
    if (note.required && validTimestamp(note.dueAt) && Date.parse(note.dueAt) < Date.parse(at) && note.status !== "sent") blockers.push(`${kind} notification is overdue.`);
  }
  return [...new Set(blockers)];
}
export const LANES: { id: GarageLane; label: string; description: string; color: string }[] = [
  { id: "road", label: "Road ready", description: "Available in the loaded report", color: "var(--good)" },
  { id: "repair", label: "Repair bays", description: "Workshop work still open", color: "var(--accent-ink)" },
  { id: "renewal", label: "Renewal desk", description: "Registration or insurance blocks", color: "var(--warn)" },
  { id: "incident", label: "Accident intake", description: "Assess, repair and recover", color: "var(--bad)" },
  { id: "dispatch", label: "Dispatch review", description: "Repair ready; verify and hand over", color: "var(--good)" },
  { id: "verify", label: "Safety checks", description: "Maintenance, recall or evidence gaps", color: "var(--muted)" },
];

export function vehicleLabel(row: GarageRow) { return row.plate_number || row.vehicle_id; }
export function localDate(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function documentCurrent(expiry: string | null, asOf: string): boolean | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry) || !/^\d{4}-\d{2}-\d{2}/.test(asOf)) return null;
  const date = expiry.slice(0, 10), parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date >= asOf.slice(0, 10); // Valid throughout the expiry date.
}
export function activeIncident(state: GarageState, id: string) {
  return state.incidents.find((incident) => incident.vehicleId === id && !incident.resolvedAt) ?? null;
}
export function sourceRevision(row: GarageRow, context: GarageContext, incident: GarageIncident | null) {
  return JSON.stringify([row.vehicle_id, context.snapshot, context.operations, context.recallCoverage,
    row.registration_expiry, row.insurance_expiry, row.repair_revision, row.open_jobs, row.unfinished_jobs,
    row.work_order_id, row.opened_at, row.key_in_at, row.ready_at, row.key_out_at, row.closed_at,
    row.back_in_service_at, row.pm_state, row.has_usage, row.usage_end, row.open_recalls,
    row.region, row.gcc_assessed, row.gcc_country_code, row.gcc_authority, row.gcc_source_url, row.gcc_confidence,
    row.operating_card_required, row.permit_expiry, row.insurance_covers_registration,
    row.inspection_review_from, row.inspection_expiry, row.inspection_failed, row.inspection_failed_on,
    ...(row.gcc_country_code === "BH" ? [row.registration_class, row.bahrain_registration_group,
      row.bahrain_inspection_after, row.inspection_required_by_authority] : row.gcc_country_code ? [
      row.registration_class, row.registration_class_rule, row.inspection_starts_on, row.inspection_applicability_gap,
      row.periodic_inspection, row.inspection_schedule_reference, row.inspection_rule_until, row.inspection_source_url,
      row.inspection_required_by_authority, row.first_registered, row.manufacture_date, row.registered_as_new,
      row.registration_jurisdiction, row.registration_owner_type, row.registration_weight_kg, row.vehicle_advertising,
    ] : []),
    incident ? [incident.id, incident.stage, normaliseDamageCase(incident)] : null]);
}
export function emptyReview(revision: string): GarageReview {
  return { revision, owner: "", due: "", notes: "", updatedAt: "",
    checks: { walkaround: false, road_test: false, handover: false },
    paperwork: { registration: "not_started", insurance: "not_started" } };
}

export function countryReleaseGates(row: GarageRow, date: string): ReadinessGate[] {
  const rule = row.gcc_authority && row.gcc_source_url ? {
    authority: row.gcc_authority, source: row.gcc_source_url,
    confidence: row.gcc_confidence ?? "unknown", checkedOn: date,
  } : undefined;
  const gate = (id: string, label: string, status: ReadinessGate["status"], detail: string, href = "/licence/"): ReadinessGate =>
    ({ id, label, status, detail, href, rule });
  if (!row.gcc_assessed || !row.region?.trim()) {
    return [gate("gcc-scope", "Country rules", "unknown", "Record the vehicle region and refresh the country evidence.")];
  }
  // A region outside the documented GCC packs continues through the general release checks.
  if (!row.gcc_country_code) return [];
  const gates: ReadinessGate[] = [];
  if (row.operating_card_required === null) {
    gates.push(gate("gcc-card", "Operating card applicability", "unknown", "Record the vehicle use to determine whether a TGA operating card is required."));
  } else if (row.operating_card_required) {
    const status = documentCurrent(row.permit_expiry, date);
    gates.push(gate("gcc-card", "TGA operating card", status === true ? "pass" : status === false ? "blocked" : "unknown",
      status === null ? "Add the TGA or Naql operating card and its expiry." : `Card ${status ? "valid through" : "expired on"} ${row.permit_expiry?.slice(0, 10)}.`));
  }
  if (row.insurance_covers_registration) {
    const registration = documentCurrent(row.registration_expiry, date);
    const insurance = documentCurrent(row.insurance_expiry, date);
    const covers = registration === null || insurance === null ? null : row.insurance_expiry!.slice(0, 10) >= row.registration_expiry!.slice(0, 10);
    gates.push(gate("gcc-cover", "Insurance covers the registration period", covers === true ? "pass" : covers === false ? "blocked" : "unknown",
      covers === true ? "Policy covers the full registration period." : covers === false ? "Record a policy that covers the registration through its expiry." : "Record both the policy and registration expiry dates."));
  }
  const country = row.gcc_country_code === "AE" ? "UAE" : row.gcc_country ?? row.gcc_country_code;
  const inspection = country + " technical inspection";
  const inspectionGate = (status: ReadinessGate["status"], detail: string, href = "/licence/"): ReadinessGate => ({
    id: "gcc-inspection", label: inspection, status, detail, href,
    rule: rule && { ...rule, source: row.inspection_source_url ?? rule.source },
  });
  if (row.inspection_failed) {
    const failedOn = row.inspection_failed_on?.slice(0, 10);
    gates.push(inspectionGate("blocked", `Technical inspection failed${failedOn ? " on " + failedOn : ""}. Record a passing reinspection before release.`, "/documents/"));
  }
  const inRenewalWindow = row.inspection_review_from !== null && row.inspection_review_from.slice(0, 10) <= date;
  if (row.gcc_country_code === "BH") {
    const group = row.bahrain_registration_group;
    const threshold = row.bahrain_inspection_after?.slice(0, 10);
    if (!group || !row.registration_class) {
      gates.push(gate("gcc-registration-class", "Bahrain registration class", "unknown", row.registration_class
        ? `Class “${row.registration_class}” is unrecognized. Verify the official registration type on the card or in Bahrain Traffic.`
        : "Add the official registration type from the Bahrain registration card.", "/import/"));
    } else {
      gates.push(gate("gcc-registration-class", "Bahrain registration class", "pass", row.registration_class,
        "/import/"));
      if (row.inspection_failed) return gates;
      if (row.inspection_required_by_authority || (inRenewalWindow && (group === "other" || (threshold && date > threshold)))) {
        const current = documentCurrent(row.inspection_expiry, date);
        const reason = row.inspection_required_by_authority ? "Bahrain Traffic requires inspection." : "Inspection is due for renewal.";
        gates.push(gate("gcc-inspection", inspection, current ? "pass" : "unknown",
          current ? `${reason} Evidence valid through ${row.inspection_expiry?.slice(0, 10)}.`
            : `${reason} Add current technical inspection evidence before release.`, "/documents/"));
      } else if (group === "private" && !threshold) {
        gates.push(gate("gcc-inspection", inspection, "unknown",
          "Add the actual manufacture date to determine the Private inspection exemption.", "/import/"));
      } else {
        gates.push(gate("gcc-inspection", inspection, "pass",
          group === "private" && threshold && date <= threshold
            ? `Private class age exemption applies through ${threshold}.`
            : "The vehicle is outside the configured renewal review window."));
      }
    }
  } else {
    const classLabel = country + " registration class";
    if (!row.registration_class_rule || !row.registration_class) {
      gates.push(gate("gcc-registration-class", classLabel, "unknown", row.registration_class
        ? `Class “${row.registration_class}” is unrecognized. Verify the official vehicle type on the registration card.`
        : "Add the official vehicle type from the registration card.", "/import/"));
      return gates;
    }
    gates.push(gate("gcc-registration-class", classLabel, "pass", row.registration_class, "/import/"));
    if (row.inspection_failed) return gates;
    const startsOn = row.inspection_starts_on?.slice(0, 10);
    const current = documentCurrent(row.inspection_expiry, date);
    const due = (row.periodic_inspection || inRenewalWindow) && (!startsOn || date >= startsOn);
    const reason = row.inspection_required_by_authority ? "The licensing authority requires inspection."
      : row.periodic_inspection ? "Periodic inspection is due." : "Inspection is due for renewal.";
    const reference = row.inspection_schedule_reference ? ` Authority record ${row.inspection_schedule_reference}.` : "";
    const evidenceNeeded = row.gcc_country_code === "QA"
      ? "Add the current FAHES pass report with its issue and expiry dates before release."
      : row.gcc_country_code === "AE" && ["dubai", "dxb", "rta", "دبي"].includes(row.registration_jurisdiction ?? "")
        ? "Add current inspection evidence with the issue date, expiry and Dubai inspection centre or RTA issuer."
        : "Add a current passing inspection report with its issue and expiry dates before release.";
    if (row.inspection_rule_until && date > row.inspection_rule_until.slice(0, 10)) {
      gates.push(inspectionGate("unknown", "Refresh the fleet report to apply the inspection rule in force on the handover date.", "/import/"));
    } else if (current) {
      gates.push(inspectionGate("pass", `Evidence valid through ${row.inspection_expiry?.slice(0, 10)}.`, "/documents/"));
    } else if (row.inspection_required_by_authority) {
      gates.push(inspectionGate("unknown", `${reason} ${evidenceNeeded}`, "/documents/"));
    } else if (row.inspection_applicability_gap) {
      gates.push(inspectionGate("unknown", row.inspection_applicability_gap + ".", "/import/"));
    } else if (due) {
      gates.push(inspectionGate("unknown", `${reason} ${evidenceNeeded}`, "/documents/"));
    } else {
      gates.push(inspectionGate("pass", startsOn && date < startsOn
        ? `Inspection requirement starts on ${startsOn}.${reference}`
        : "The vehicle is outside the configured renewal review window."));
    }
  }
  return gates;
}

export function sourceGates(row: GarageRow, context: GarageContext): ReadinessGate[] {
  // Demo practice keeps its report date. An owner fleet always uses the operator's current date.
  const snapshotDate = context.snapshot.slice(0, 10);
  const date = context.demo ? snapshotDate : context.today;
  const usageGap = row.usage_end ? (Date.parse(context.snapshot.slice(0, 10) + "T00:00:00Z") - Date.parse(row.usage_end.slice(0, 10) + "T00:00:00Z")) / 864e5 : Infinity;
  const usageCurrent = row.has_usage && Number.isFinite(usageGap) && usageGap >= 0 && usageGap <= 1;
  const document = (id: string, title: string, expiry: string | null): ReadinessGate => {
    const valid = documentCurrent(expiry, date);
    return { id, label: title, status: valid === null ? "unknown" : valid ? "pass" : "blocked",
      detail: expiry ? "Expires " + expiry.slice(0, 10) + " · checked " + date : "Expiry date is not recorded", href: "/documents/" };
  };
  const gates: ReadinessGate[] = [
    document("registration", "Registration current", row.registration_expiry),
    document("insurance", "Insurance current", row.insurance_expiry),
    { id: "repairs", label: "Repair orders closed", status: !context.operations ? "unknown" : row.open_jobs > 0 ? "blocked" : "pass",
      detail: !context.operations ? "Work-order evidence is not loaded" : row.open_jobs ? String(row.open_jobs) + " work order(s) remain open" : "No open work orders in this report", href: "/workshop/" },
    { id: "maintenance", label: "Maintenance within interval",
      status: !context.operations || !usageCurrent || !row.pm_state ? "unknown" : row.pm_state === "Overdue" ? "blocked" : "pass",
      detail: !usageCurrent || !context.operations ? "Usage / service evidence needs verification; vehicle usage covers " + (row.usage_end?.slice(0, 10) ?? "no recorded period") : row.pm_state ?? "Maintenance schedule is not assessed", href: "/licence/" },
    { id: "recalls", label: "Recall clearance", status: !context.recallCoverage ? "unknown" : row.open_recalls > 0 ? "blocked" : "pass",
      detail: !context.recallCoverage ? "Affected-vehicle / campaign records are not loaded" : row.open_recalls ? String(row.open_recalls) + " outstanding campaign(s)" : "No outstanding campaigns in loaded evidence", href: "/licence/" },
    ...countryReleaseGates(row, date),
  ];
  if (!context.demo) {
    const snapshot = context.snapshot.slice(0, 10);
    const age = (Date.parse(context.today + "T00:00:00Z") - Date.parse(snapshot + "T00:00:00Z")) / 864e5;
    gates.push({ id: "freshness", label: "Current source records", status: Number.isFinite(age) && age >= 0 && age <= 1 ? "pass" : "unknown",
      detail: "Report dated " + (snapshot || "unknown") + "; refresh records before a live handover", href: "/import/" });
  }
  return gates;
}
export function deriveVehicle(row: GarageRow, state: GarageState, context: GarageContext): GarageVehicle {
  const incident = activeIncident(state, row.vehicle_id), revision = sourceRevision(row, context, incident);
  const saved = state.reviews[row.vehicle_id];
  const review = saved?.revision === revision ? saved : { ...emptyReview(revision), owner: saved?.owner ?? incident?.owner ?? "", due: saved?.due ?? "", paperwork: saved?.paperwork ?? emptyReview(revision).paperwork };
  const gates = sourceGates(row, context);
  const sourceClear = gates.every((g) => g.status === "pass");
  const handoverRecorded = state.handovers.some((h) => h.vehicleId === row.vehicle_id && h.revision === revision);
  const documentBlock = gates.slice(0, 2).some((g) => g.status !== "pass");
  // A recorded handover stays in history when current evidence no longer supports release.
  const released = handoverRecorded && sourceClear;
  const recovery = incident?.stage;
  let lane: GarageLane;
  if (recovery === "reported" || recovery === "assessment" || (!incident && row.collision_jobs > 0 && row.unfinished_jobs > 0)) lane = "incident";
  else if (recovery === "repair" || row.unfinished_jobs > 0) lane = "repair";
  else if (documentBlock) lane = "renewal";
  else if (incident || row.ready_jobs > 0 || (row.ready_at && !row.back_in_service_at && !released)) lane = "dispatch";
  else if (!sourceClear) lane = "verify";
  else lane = "road";
  return { row, lane, gates, incident, revision, review, sourceClear, released, handoverRecorded,
    readiness: gates.filter((g) => g.status === "pass").length,
    blockers: gates.filter((g) => g.status !== "pass").map((g) => g.label),
    milestones: [
      { label: "Job opened", at: row.opened_at }, { label: "Key in", at: row.key_in_at },
      { label: "Repair ready", at: row.ready_at }, { label: "Key collected", at: row.key_out_at },
      { label: "Back to operations", at: row.back_in_service_at },
    ] };
}
export function reportAccident(state: GarageState, input: Omit<GarageIncident, "stage" | "createdAt" | "updatedAt">, at: string): GarageState {
  if (!input.vehicleId || input.summary.trim().length < 5 || !input.owner.trim()) throw new Error("Choose a vehicle, name the owner and describe the incident.");
  if (!Number.isFinite(Date.parse(input.occurredAt)) || Date.parse(input.occurredAt) > Date.parse(at) + 60_000) throw new Error("Use a valid incident time that is not in the future.");
  if (state.incidents.some((i) => i.id === input.id)) return state;
  if (activeIncident(state, input.vehicleId)) throw new Error("This vehicle already has an open incident. Update its recovery stage instead.");
  const reviews = { ...state.reviews }; delete reviews[input.vehicleId];
  const previous = state.reviews[input.vehicleId];
  const reviewHistory = previous ? [{ vehicleId: input.vehicleId, review: previous, archivedAt: at, reason: "New incident" }, ...(state.reviewHistory ?? [])] : state.reviewHistory;
  const draft: GarageIncident = { ...input, summary: input.summary.trim(), owner: input.owner.trim(), stage: "reported", createdAt: at, updatedAt: at };
  draft.damage = normaliseDamageCase(draft);
  const errors = damageRecordErrors(draft.damage);
  if (errors.length) throw new Error(errors[0]);
  return { ...state, reviews, reviewHistory, incidents: [draft, ...state.incidents] };
}
export function updateDamageCase(state: GarageState, incidentId: string, next: DamageCase, actor: string, at: string, recoveryOwner?: string): GarageState {
  const incident = state.incidents.find((item) => item.id === incidentId && !item.resolvedAt);
  if (!incident) throw new Error("The incident is no longer open.");
  if (!validTimestamp(at) || !actor.trim()) throw new Error("Record a valid update time and responsible person.");
  const owner = recoveryOwner?.trim() ?? incident.owner;
  if (!owner) throw new Error("Name the recovery owner.");
  const damage = normaliseDamageCase({ ...incident, damage: next });
  const validation = damageRecordErrors(damage);
  if (validation.length) throw new Error(validation[0]);
  const prior = normaliseDamageCase(incident);
  if (prior.hold.releasedAt && (damage.hold.active || damage.hold.releasedAt !== prior.hold.releasedAt)) throw new Error("A released damage hold is immutable after handover.");
  const history = [...prior.history, { id: `update:${at}:${prior.history.length}`, at, actor: actor.trim(), action: "Damage case updated",
    detail: owner === incident.owner ? `Recorded during ${incident.stage} stage.` : `Recovery owner changed from ${incident.owner} to ${owner}.` }];
  damage.history = history;
  const reviews = { ...state.reviews }; delete reviews[incident.vehicleId];
  const previous = state.reviews[incident.vehicleId];
  const reviewHistory = previous ? [{ vehicleId: incident.vehicleId, review: previous, archivedAt: at, reason: "Damage case evidence changed" }, ...(state.reviewHistory ?? [])] : state.reviewHistory;
  return { ...state, reviews, reviewHistory, incidents: state.incidents.map((item) => item.id === incidentId ? { ...item, owner, damage, updatedAt: at } : item) };
}
export function advanceIncident(state: GarageState, incidentId: string, at: string): GarageState {
  const incident = state.incidents.find((i) => i.id === incidentId && !i.resolvedAt);
  if (!incident) throw new Error("The incident is no longer open.");
  const index = RECOVERY_STAGES.findIndex((s) => s.id === incident.stage);
  if (index >= RECOVERY_STAGES.length - 1) throw new Error("Complete the dispatch checklist to close this incident.");
  const blockers = damageStageBlockers(incident);
  if (blockers.length) throw new Error(blockers[0]);
  const damage = normaliseDamageCase(incident);
  damage.history = [...damage.history, { id: `stage:${at}:${damage.history.length}`, at, actor: incident.owner, action: `Advanced to ${RECOVERY_STAGES[index + 1].label}`, detail: "All recorded stage gates passed." }];
  const reviews = { ...state.reviews }; delete reviews[incident.vehicleId];
  return { ...state, reviews, incidents: state.incidents.map((i) => i.id === incidentId ? { ...i, damage, stage: RECOVERY_STAGES[index + 1].id, updatedAt: at } : i) };
}
export function releaseBlockers(row: GarageRow, state: GarageState, context: GarageContext, review: GarageReview): string[] {
  const v = deriveVehicle(row, state, context);
  const reasons = v.gates.filter((g) => g.status !== "pass").map((g) => g.label + ": " + g.detail);
  if (review.revision !== v.revision) reasons.push("Evidence changed. Review the new source records and repeat the release checks.");
  if (v.incident) reasons.push(...damageHandoverBlockers(v.incident, new Date().toISOString()));
  if (!review.owner.trim()) reasons.push("Name the person reviewing this handover.");
  for (const check of CHECKS) if (!review.checks[check.id]) reasons.push(check.label + " is not signed off.");
  return reasons;
}
export function recordHandover(state: GarageState, row: GarageRow, context: GarageContext, review: GarageReview, at: string): GarageState {
  const id = row.vehicle_id + ":" + review.revision;
  if (state.handovers.some((h) => h.id === id || (h.vehicleId === row.vehicle_id && h.revision === review.revision))) return state;
  const blockers = releaseBlockers(row, state, context, review);
  if (blockers.length) throw new Error(blockers[0]);
  const reviewed = saveGarageReview(state, row, context, review, at);
  const incidentIds = state.incidents.filter((i) => i.vehicleId === row.vehicle_id && !i.resolvedAt).map((i) => i.id);
  const closing = state.incidents.filter((i) => incidentIds.includes(i.id));
  for (const incident of closing) {
    const damageBlockers = damageHandoverBlockers(incident, at);
    if (damageBlockers.length) throw new Error(damageBlockers[0]);
  }
  const damageSnapshot = closing[0] ? copyDamage(normaliseDamageCase(closing[0])) : undefined;
  const incidents = state.incidents.map((i) => {
    if (!incidentIds.includes(i.id)) return i;
    const damage = normaliseDamageCase(i);
    damage.hold = { ...damage.hold, active: false, releasedAt: at };
    damage.history = [...damage.history, { id: `closed:${at}`, at, actor: review.owner.trim(), action: "Handover recorded", detail: "Hold released only after source, quality and dispatch gates passed." }];
    return { ...i, damage, resolvedAt: at, updatedAt: at };
  });
  const result = { ...reviewed, incidents, reviews: { ...reviewed.reviews, [row.vehicle_id]: { ...review, updatedAt: at } },
    handovers: [{ id, vehicleId: row.vehicle_id, revision: review.revision, reviewer: review.owner.trim(), at, incidentIds, snapshot: context.snapshot,
      countryScope: row.gcc_country ?? "Outside the GCC rule pack",
      review: { ...review, checks: { ...review.checks }, paperwork: { ...review.paperwork } },
      source: sourceGates(row, context), damageSnapshot }, ...state.handovers] };
  // The resolved incident no longer participates in the vehicle revision. Keep the successful review linked to that state too.
  const nextRevision = sourceRevision(row, context, null);
  return { ...result, reviews: { ...result.reviews, [row.vehicle_id]: { ...review, revision: nextRevision, updatedAt: at } },
    handovers: result.handovers.map((h, i) => i === 0 ? { ...h, revision: nextRevision } : h) };
}
export function saveGarageReview(state: GarageState, row: GarageRow, context: GarageContext, review: GarageReview, at: string): GarageState {
  if (deriveVehicle(row, state, context).revision !== review.revision) throw new Error("Vehicle evidence changed. Reopen the review before saving.");
  const previous = state.reviews[row.vehicle_id];
  const reviewHistory = previous && previous.revision !== review.revision
    ? [{ vehicleId: row.vehicle_id, review: previous, archivedAt: at, reason: "Source evidence changed" }, ...(state.reviewHistory ?? [])]
    : state.reviewHistory;
  return { ...state, reviewHistory, reviews: { ...state.reviews, [row.vehicle_id]: { ...review, updatedAt: at } } };
}
export function assertGarageGeneration(expected: number, current: number) {
  if (expected !== current) throw new Error("The fleet report changed before this action was saved. Reopen the vehicle and review its current evidence.");
}
export interface GarageAlert {
  id: string; vehicleId: string; title: string; detail: string; priority: "critical" | "warning" | "ready";
}
export function buildAlerts(vehicles: GarageVehicle[], now = Date.now()): GarageAlert[] {
  const alerts: GarageAlert[] = [];
  for (const v of vehicles) {
    const r = v.row, label = vehicleLabel(r);
    if (v.incident) {
      const damage = normaliseDamageCase(v.incident);
      alerts.push({ id: "incident:" + v.incident.id, vehicleId: r.vehicle_id, title: label + " · accident reported", detail: v.incident.summary, priority: "critical" });
      for (const kind of DAMAGE_NOTIFICATIONS) {
        const note = damage.notifications[kind];
        if (note.required && note.status !== "sent" && validTimestamp(note.dueAt) && Date.parse(note.dueAt) <= now) alerts.push({ id: `damage-overdue:${v.incident.id}:${kind}`, vehicleId: r.vehicle_id, title: `${label} · ${kind} notification overdue`, detail: "Escalate the recorded deadline. No message is sent by this app.", priority: "critical" });
      }
    }
    else if (r.collision_jobs > 0) alerts.push({ id: "collision:" + r.vehicle_id + ":" + r.repair_revision, vehicleId: r.vehicle_id, title: label + " · collision job open", detail: "Imported work-order evidence; confirm the recovery owner.", priority: "critical" });
    for (const gate of v.gates.filter((item) => item.id.startsWith("gcc-") && item.status !== "pass")) {
      alerts.push({ id: `gcc:${gate.id}:${r.vehicle_id}`, vehicleId: r.vehicle_id, title: `${label} · ${gate.label}`, detail: gate.detail, priority: gate.status === "blocked" ? "critical" : "warning" });
    }
    for (const kind of ["registration", "insurance"] as const) {
      const gate = v.gates.find((g) => g.id === kind)!;
      if (gate.status === "blocked") alerts.push({ id: kind + ":" + r.vehicle_id + ":" + r[kind + "_expiry" as keyof GarageRow], vehicleId: r.vehicle_id, title: label + " · " + kind + " expired", detail: "Keep this vehicle held until renewed evidence is recorded.", priority: "critical" });
      else if (gate.status === "unknown") alerts.push({ id: "unknown:" + kind + ":" + r.vehicle_id, vehicleId: r.vehicle_id, title: label + " · verify " + kind, detail: "An expiry date is missing. Verify source documents before dispatch.", priority: "warning" });
      else if (r[kind + "_status" as keyof GarageRow] === "Expiring") alerts.push({ id: "due:" + kind + ":" + r.vehicle_id + ":" + r[kind + "_expiry" as keyof GarageRow], vehicleId: r.vehicle_id, title: label + " · " + kind + " renewal due", detail: "Start the renewal before expiry.", priority: "warning" });
    }
    if (v.lane === "dispatch" && v.sourceClear) alerts.push({ id: "ready:" + r.vehicle_id + ":" + v.revision, vehicleId: r.vehicle_id, title: label + " · dispatch review", detail: "Source checks passed. Complete the recorded release review.", priority: "ready" });
    if (r.pm_state === "Overdue") alerts.push({ id: "pm:" + r.vehicle_id + ":" + r.repair_revision, vehicleId: r.vehicle_id, title: label + " · service overdue", detail: "Book maintenance and refresh the completed work order.", priority: "warning" });
  }
  const rank = { critical: 0, ready: 1, warning: 2 };
  return alerts.sort((a, b) => rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title));
}
