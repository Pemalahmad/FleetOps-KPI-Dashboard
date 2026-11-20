/** Garage rules: source evidence is separate from recorded operational work. */
export type GarageLane = "road" | "repair" | "renewal" | "incident" | "dispatch" | "verify";
export type RecoveryStage = "reported" | "assessment" | "repair" | "quality" | "ready";
export type PaperworkStage = "not_started" | "submitted" | "received";
export type CheckId = "walkaround" | "road_test" | "handover";
export interface GarageIncident {
  id: string; vehicleId: string; summary: string; owner: string; occurredAt: string;
  stage: RecoveryStage; createdAt: string; updatedAt: string; resolvedAt?: string;
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
}
export interface GarageState {
  version: 1; incidents: GarageIncident[]; reviews: Record<string, GarageReview>;
  acknowledged: string[]; handovers: GarageHandover[];
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
}
export interface GarageContext {
  snapshot: string; today: string; demo: boolean; operations: boolean; recallCoverage: boolean;
}
export interface ReadinessGate { id: string; label: string; status: "pass" | "blocked" | "unknown"; detail: string; href: string }
export interface GarageVehicle {
  row: GarageRow; lane: GarageLane; gates: ReadinessGate[]; incident: GarageIncident | null;
  review: GarageReview; revision: string; sourceClear: boolean; released: boolean; readiness: number;
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
    row.back_in_service_at, row.pm_state, row.has_usage, row.usage_end, row.open_recalls, incident?.id ?? null]);
}
export function emptyReview(revision: string): GarageReview {
  return { revision, owner: "", due: "", notes: "", updatedAt: "",
    checks: { walkaround: false, road_test: false, handover: false },
    paperwork: { registration: "not_started", insurance: "not_started" } };
}
export function sourceGates(row: GarageRow, context: GarageContext, current = false): ReadinessGate[] {
  const date = current && !context.demo ? context.today : context.snapshot.slice(0, 10);
  const usageGap = row.usage_end ? (Date.parse(context.snapshot.slice(0, 10) + "T00:00:00Z") - Date.parse(row.usage_end.slice(0, 10) + "T00:00:00Z")) / 864e5 : Infinity;
  const usageCurrent = row.has_usage && Number.isFinite(usageGap) && usageGap >= 0 && usageGap <= 1;
  const document = (id: string, title: string, expiry: string | null): ReadinessGate => {
    const valid = documentCurrent(expiry, date);
    return { id, label: title, status: valid === null ? "unknown" : valid ? "pass" : "blocked",
      detail: expiry ? "Expires " + expiry.slice(0, 10) + (current && !context.demo ? " · checked against today" : "") : "Expiry date is not recorded", href: "/documents/" };
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
  ];
  if (current && !context.demo) {
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
  const released = state.handovers.some((h) => h.vehicleId === row.vehicle_id && h.revision === revision);
  const documentBlock = gates.slice(0, 2).some((g) => g.status !== "pass");
  const recovery = incident?.stage;
  let lane: GarageLane;
  if (recovery === "reported" || recovery === "assessment" || (!incident && row.collision_jobs > 0 && row.unfinished_jobs > 0)) lane = "incident";
  else if (recovery === "repair" || row.unfinished_jobs > 0) lane = "repair";
  else if (documentBlock) lane = "renewal";
  else if (incident || row.ready_jobs > 0 || (row.ready_at && !row.back_in_service_at && !released)) lane = "dispatch";
  else if (!sourceClear) lane = "verify";
  else lane = "road";
  return { row, lane, gates, incident, revision, review, sourceClear, released,
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
  return { ...state, reviews, reviewHistory, incidents: [{ ...input, summary: input.summary.trim(), owner: input.owner.trim(), stage: "reported", createdAt: at, updatedAt: at }, ...state.incidents] };
}
export function advanceIncident(state: GarageState, incidentId: string, at: string): GarageState {
  const incident = state.incidents.find((i) => i.id === incidentId && !i.resolvedAt);
  if (!incident) throw new Error("The incident is no longer open.");
  const index = RECOVERY_STAGES.findIndex((s) => s.id === incident.stage);
  if (index >= RECOVERY_STAGES.length - 1) throw new Error("Complete the dispatch checklist to close this incident.");
  return { ...state, incidents: state.incidents.map((i) => i.id === incidentId ? { ...i, stage: RECOVERY_STAGES[index + 1].id, updatedAt: at } : i) };
}
export function releaseBlockers(row: GarageRow, state: GarageState, context: GarageContext, review: GarageReview): string[] {
  const v = deriveVehicle(row, state, context);
  const reasons = sourceGates(row, context, true).filter((g) => g.status !== "pass").map((g) => g.label + ": " + g.detail);
  if (review.revision !== v.revision) reasons.push("Evidence changed. Review the new source records and repeat the release checks.");
  if (v.incident && v.incident.stage !== "ready") reasons.push("Accident recovery must reach Ready for review.");
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
  const incidents = state.incidents.map((i) => incidentIds.includes(i.id) ? { ...i, resolvedAt: at, updatedAt: at } : i);
  const result = { ...reviewed, incidents, reviews: { ...reviewed.reviews, [row.vehicle_id]: { ...review, updatedAt: at } },
    handovers: [{ id, vehicleId: row.vehicle_id, revision: review.revision, reviewer: review.owner.trim(), at, incidentIds, snapshot: context.snapshot,
      review: { ...review, checks: { ...review.checks }, paperwork: { ...review.paperwork } },
      source: sourceGates(row, context, true).map((g) => ({ ...g })) }, ...state.handovers] };
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
export function buildAlerts(vehicles: GarageVehicle[]): GarageAlert[] {
  const alerts: GarageAlert[] = [];
  for (const v of vehicles) {
    const r = v.row, label = vehicleLabel(r);
    if (v.incident) alerts.push({ id: "incident:" + v.incident.id, vehicleId: r.vehicle_id, title: label + " · accident reported", detail: v.incident.summary, priority: "critical" });
    else if (r.collision_jobs > 0) alerts.push({ id: "collision:" + r.vehicle_id + ":" + r.repair_revision, vehicleId: r.vehicle_id, title: label + " · collision job open", detail: "Imported work-order evidence; confirm the recovery owner.", priority: "critical" });
    for (const kind of ["registration", "insurance"] as const) {
      const gate = v.gates.find((g) => g.id === kind)!;
      if (gate.status === "blocked") alerts.push({ id: kind + ":" + r.vehicle_id + ":" + r[kind + "_expiry" as keyof GarageRow], vehicleId: r.vehicle_id, title: label + " · " + kind + " expired", detail: "Keep this vehicle held until renewed evidence is recorded.", priority: "critical" });
      else if (gate.status === "unknown") alerts.push({ id: "unknown:" + kind + ":" + r.vehicle_id, vehicleId: r.vehicle_id, title: label + " · verify " + kind, detail: "An expiry date is missing. Verify source documents before dispatch.", priority: "warning" });
      else if (r[kind + "_status" as keyof GarageRow] === "Expiring") alerts.push({ id: "due:" + kind + ":" + r.vehicle_id + ":" + r[kind + "_expiry" as keyof GarageRow], vehicleId: r.vehicle_id, title: label + " · " + kind + " renewal due", detail: "Start the renewal before expiry.", priority: "warning" });
    }
    if (v.lane === "dispatch") alerts.push({ id: "ready:" + r.vehicle_id + ":" + v.revision, vehicleId: r.vehicle_id, title: label + " · dispatch review", detail: "Repair milestones or recovery stage are ready for the next check.", priority: "ready" });
    if (r.pm_state === "Overdue") alerts.push({ id: "pm:" + r.vehicle_id + ":" + r.repair_revision, vehicleId: r.vehicle_id, title: label + " · service overdue", detail: "Book maintenance and refresh the completed work order.", priority: "warning" });
  }
  const rank = { critical: 0, ready: 1, warning: 2 };
  return alerts.sort((a, b) => rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title));
}
