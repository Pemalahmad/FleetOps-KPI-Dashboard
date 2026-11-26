import { documentCurrent, localDate, type GarageState } from "./garage";

export const EHS_COUNTRIES = ["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates"] as const;
export const EHS_CATEGORIES = ["Road incident", "Injury or illness", "Near miss", "Workshop or site hazard", "Spill or environmental release", "Fire or emergency"] as const;
export const EHS_PRIORITY = {
  critical: { label: "Critical", example: "Serious injury, fire, uncontrolled release or immediate danger", notify: "Emergency services as needed, site lead, EHS lead and duty manager immediately", followUp: "Same day" },
  high: { label: "High", example: "Potentially serious near miss, injury or contained significant spill", notify: "Site lead and EHS lead within the shift", followUp: "Next calendar day" },
  routine: { label: "Routine", example: "Controlled hazard or lower-risk near miss", notify: "Site supervisor by the next working day", followUp: "Within 3 calendar days" },
} as const;
export const EHS_STAGES = {
  reported: "Reported",
  escalated: "Escalated",
  contained: "Contained",
  corrective: "Corrective action",
  closed: "Verified closed",
} as const;
const NEXT_STAGE = { reported: "escalated", escalated: "contained", contained: "corrective", corrective: "closed" } as const;

type Priority = keyof typeof EHS_PRIORITY;
export type EhsStage = keyof typeof EHS_STAGES;
type Country = typeof EHS_COUNTRIES[number];
type Category = typeof EHS_CATEGORIES[number];
export type EhsReport = {
  country: Country; category: Category; priority: Priority; site: string; vehicle: string;
  summary: string; reporter: string; occurredAt: string;
};
export type EhsCase = EhsReport & {
  id: string; createdAt: string; stage: EhsStage; owner: string; manager: string; due: string;
  notification: "pending" | "reported" | "not_required"; authorityRecord: string;
  history: { at: string; actor: string; stage: EhsStage; detail: string; owner: string; manager: string; due: string }[];
};
export type EhsUpdate = Pick<EhsCase, "owner" | "manager" | "due" | "notification" | "authorityRecord"> & {
  actor: string; detail: string;
};
export const nextEhsStage = (stage: EhsStage): EhsStage | null => stage === "closed" ? null : NEXT_STAGE[stage];

export function reportEhsCase(state: GarageState, report: EhsReport, id: string, now = new Date()): GarageState {
  const { country, category, priority, occurredAt } = report;
  const site = report.site.trim(), summary = report.summary.trim(), reporter = report.reporter.trim();
  if (!EHS_COUNTRIES.includes(country) || !EHS_CATEGORIES.includes(category) || !Object.hasOwn(EHS_PRIORITY, priority)
    || !site || !summary || !reporter) throw new Error("Enter the site, category, severity, summary and reporter.");
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred) || occurred > now.getTime()) throw new Error("Enter a valid incident time at or before now.");
  const at = now.toISOString();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + { critical: 0, high: 1, routine: 3 }[priority]);
  const due = localDate(deadline);
  const item: EhsCase = {
    ...report, site, summary, reporter, vehicle: report.vehicle.trim(), occurredAt: new Date(occurred).toISOString(),
    id, createdAt: at, stage: "reported", owner: "", manager: "", due, notification: "pending", authorityRecord: "",
    history: [{ at, actor: reporter, stage: "reported", detail: summary, owner: "", manager: "", due }],
  };
  return { ...state, ehsCases: [item, ...(state.ehsCases ?? [])] };
}

export function updateEhsCase(state: GarageState, id: string, stage: EhsStage, input: EhsUpdate, at: string): GarageState {
  const cases = state.ehsCases ?? [];
  const item = cases.find((candidate) => candidate.id === id);
  if (!item || item.stage === "closed") throw new Error("This EHS case is already closed or unavailable.");
  if (stage !== item.stage && stage !== nextEhsStage(item.stage)) throw new Error("Complete the current SOP step first.");
  const owner = input.owner.trim(), manager = input.manager.trim(), actor = input.actor.trim(), detail = input.detail.trim();
  const { due, notification } = input;
  const authorityRecord = input.authorityRecord.trim();
  if (!owner || !manager || !actor || !detail || due.length !== 10 || documentCurrent(due, at.slice(0, 10)) === null) {
    throw new Error("Enter an owner, manager, follow-up date, your name and a case note.");
  }
  if (notification !== "pending" && !authorityRecord) throw new Error("Record the filing reference or the authority decision and basis.");
  if (stage === "closed") {
    if (notification === "pending") throw new Error("Resolve the external reporting review before closing the case.");
    if (actor.toLowerCase() === owner.toLowerCase()) throw new Error("A reviewer other than the case owner must verify closure.");
  }
  const note = notification !== item.notification || authorityRecord !== item.authorityRecord
    ? `${detail} · External reporting: ${notification === "reported" ? "filed" : notification === "not_required" ? "not required" : "pending review"}${authorityRecord ? ` (${authorityRecord})` : ""}`
    : detail;
  const updated = { ...item, owner, manager, due, stage, notification, authorityRecord,
    history: [...item.history, { at, actor, stage, detail: note, owner, manager, due }],
  };
  return { ...state, ehsCases: cases.map((candidate) => candidate.id === id ? updated : candidate) };
}
