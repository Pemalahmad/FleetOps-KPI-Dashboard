import { documentCurrent, vehicleLabel, type GarageState, type GarageVehicle } from "./garage";
import type { ComplianceReminder } from "./garage-command";
import type { SavedDocument } from "./workspace";

export const ESCALATION_STAGES = {
  open: "Open",
  escalated: "Escalated",
  awaiting_document: "Awaiting document",
  closed: "Closed",
} as const;
type CaseStage = keyof typeof ESCALATION_STAGES;

export interface EscalationProof {
  id: string;
  name: string;
  reference: string | null;
  expiresOn: string;
}

export interface EscalationEvent {
  at: string;
  by: string;
  stage: CaseStage;
  note: string;
  owner?: string;
  manager?: string;
  followUp?: string;
  proof?: EscalationProof;
}

export interface ComplianceEscalation {
  id: string;
  reminderId: string;
  vehicleId: string;
  plate: string;
  region: string | null;
  countryCode: string;
  country: string;
  kind: ComplianceReminder["kind"];
  dueOn: string;
  previousExpiry: string | null;
  owner: string | null;
  manager: string;
  followUp: string;
  stage: CaseStage;
  history: EscalationEvent[];
  proof?: EscalationProof;
}

export interface EscalationUpdate {
  owner: string;
  manager: string;
  followUp: string;
  actor: string;
  note: string;
  stage: Exclude<CaseStage, "closed">;
}

export const ESCALATION_DOCUMENTS_SQL = `SELECT vehicle_id, document_id FROM stg_documents
  WHERE vehicle_id IS NOT NULL AND doc_type IN ('Registration', 'Inspection')`;
export interface EscalationDocumentMatch { vehicle_id: string; document_id: string }

export function caseOwner(item: ComplianceEscalation, owners: GarageState["reminderOwners"]): string {
  return item.owner ?? owners?.[item.reminderId] ?? "";
}

function activeProof(item: ComplianceEscalation, vehicle: GarageVehicle | undefined, uploads: SavedDocument[],
  today: string, snapshot: string): EscalationProof | undefined {
  const r = vehicle?.row;
  if (!r || r.gcc_country_code !== item.countryCode) return;
  const baseline = item.previousExpiry && item.previousExpiry > item.dueOn ? item.previousExpiry : item.dueOn;
  const registration = item.kind === "registration";
  const gate = vehicle.gates.find((g) => g.id === (registration ? "registration" : "gcc-inspection"));
  if (gate?.status !== "pass") return;
  if (!registration && (r.inspection_failed || vehicle.gates.some((g) => g.id === "gcc-registration-class" && g.status !== "pass"))) return;
  const dubai = r.gcc_country_code === "AE" && ["dubai", "dxb", "rta", "دبي"].includes(r.registration_jurisdiction ?? "");
  const effectiveExpiry = registration ? r.registration_expiry : r.inspection_expiry;
  let proof: EscalationProof | undefined;
  for (const doc of uploads) {
    if (doc.doc_type !== (registration ? "Registration" : "Inspection") || !doc.expiry_date) continue;
    const issued = doc.issue_date;
    if (issued && (documentCurrent(issued, today) === null || issued > today || issued > doc.expiry_date)) continue;
    if (!registration) {
      if (doc.inspection_result !== "Pass" || !issued || issued > snapshot || (r.inspection_failed_on && issued <= r.inspection_failed_on.slice(0, 10))) continue;
      if (dubai && r.registration_class_rule !== "ae_private_light" && !/dubai|(^|[^a-z])rta([^a-z]|$)|دبي|هيئة الطرق والمواصلات/i.test(doc.issuer ?? "")) continue;
    }
    let expiresOn = doc.expiry_date;
    if (!registration && issued && (r.gcc_country_code === "QA" || dubai)) {
      const limit = new Date(issued + "T00:00:00Z");
      limit.setUTCDate(limit.getUTCDate() + 30);
      const cap = limit.toISOString().slice(0, 10);
      if (cap < expiresOn) expiresOn = cap;
    }
    if (expiresOn <= baseline || documentCurrent(expiresOn, today) !== true || !effectiveExpiry || effectiveExpiry.slice(0, 10) < expiresOn) continue;
    if (!proof || expiresOn > proof.expiresOn) proof = { id: doc.id, name: doc.file_name, reference: doc.document_number, expiresOn };
  }
  return proof;
}

interface EscalationSources {
  vehicles: GarageVehicle[];
  reminders: ComplianceReminder[];
  documents: SavedDocument[];
  matches: EscalationDocumentMatch[];
  today: string;
  snapshot: string;
  at: string;
}

export function reconcileEscalations(state: GarageState, source: EscalationSources): GarageState {
  const vehicles = new Map(source.vehicles.map((v) => [v.row.vehicle_id, v]));
  const uploads = new Map(source.documents.filter((doc) => doc.confirmed).map((doc) => [doc.id, doc]));
  const byVehicle = new Map<string, SavedDocument[]>();
  for (const match of source.matches) {
    const doc = uploads.get(match.document_id);
    if (!doc) continue;
    const matched = byVehicle.get(match.vehicle_id) ?? [];
    matched.push(doc);
    byVehicle.set(match.vehicle_id, matched);
  }
  let changed = false;
  const cases = new Map((state.complianceEscalations ?? []).map((item) => [item.id, item]));
  const openReminders = new Set<string>();
  for (const item of cases.values()) {
    if (item.stage === "closed") continue;
    openReminders.add(item.reminderId);
    const proof = activeProof(item, vehicles.get(item.vehicleId), byVehicle.get(item.vehicleId) ?? [], source.today, source.snapshot);
    if (!proof) continue;
    cases.set(item.id, { ...item, owner: caseOwner(item, state.reminderOwners), stage: "closed", proof,
      history: [...item.history, { at: source.at, by: "FleetOps", stage: "closed", note: "Verified the updated document.", proof }] });
    changed = true;
  }
  for (const reminder of source.reminders) {
    if (reminder.status !== "Overdue" || !reminder.dueOn || openReminders.has(reminder.id)) continue;
    const r = reminder.vehicle.row;
    if (!r.gcc_country_code || !r.gcc_country) continue;
    const id = JSON.stringify([reminder.id, reminder.dueOn]);
    const closed = cases.get(id);
    const event: EscalationEvent = { at: source.at, by: "FleetOps", stage: "open",
      note: closed ? "The same deadline is overdue again." : "Opened when the deadline became overdue." };
    cases.set(id, closed ? { ...closed, stage: "open", proof: undefined, history: [...closed.history, event] } : {
      id, reminderId: reminder.id, vehicleId: r.vehicle_id, plate: vehicleLabel(r), region: r.region,
      countryCode: r.gcc_country_code, country: r.gcc_country, kind: reminder.kind, dueOn: reminder.dueOn,
      previousExpiry: (reminder.kind === "registration" ? r.registration_expiry : r.inspection_expiry)?.slice(0, 10) ?? null,
      owner: null, manager: "", followUp: "", stage: "open", history: [event],
    });
    openReminders.add(reminder.id);
    changed = true;
  }
  return changed ? { ...state, complianceEscalations: [...cases.values()] } : state;
}

export function recordEscalationUpdate(state: GarageState, id: string, draft: EscalationUpdate, at: string): GarageState {
  const items = state.complianceEscalations ?? [];
  const item = items.find((c) => c.id === id);
  if (!item || item.stage === "closed") throw new Error("This escalation is no longer open.");
  const owner = draft.owner.trim(), manager = draft.manager.trim(), actor = draft.actor.trim(), note = draft.note.trim();
  if (!actor) throw new Error("Record who made the update.");
  if (draft.stage !== "open" && (!owner || !manager)) throw new Error("Name the case owner and the manager receiving the escalation.");
  const next = item.stage === "open" ? "escalated" : "awaiting_document";
  if (draft.stage !== item.stage && draft.stage !== next) throw new Error("Record the current escalation step first.");
  if (draft.followUp && (draft.followUp.length !== 10 || documentCurrent(draft.followUp, at.slice(0, 10)) === null)) {
    throw new Error("Use a valid follow-up date.");
  }
  const updated: ComplianceEscalation = { ...item, owner, manager, followUp: draft.followUp, stage: draft.stage,
    history: [...item.history, { at, by: actor, stage: draft.stage, note, owner, manager, followUp: draft.followUp }] };
  return { ...state, complianceEscalations: items.map((c) => c.id === id ? updated : c) };
}
