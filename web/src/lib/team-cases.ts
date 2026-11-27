import { createClient } from "@supabase/supabase-js";
import { ESCALATION_STAGES, type ComplianceEscalation } from "./garage-escalations";
import { EHS_COUNTRIES, EHS_STAGES, type EhsCase } from "./ehs";
import { teamConfiguration } from "./team-origin.mjs";

const publicKey = process.env.NEXT_PUBLIC_FLEETOPS_TEAM_KEY;
const endpoint = teamConfiguration(process.env.NEXT_PUBLIC_FLEETOPS_TEAM_URL, publicKey);
export const teamConfigured = Boolean(endpoint);
const client = teamConfigured ? createClient(endpoint, publicKey!, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;
export const teamClient = client;
const EHS_CODES = ["BH", "KW", "OM", "QA", "SA", "AE"] as const;
export const TEAM_COUNTRIES = Object.fromEntries(EHS_CODES.map((code, index) => [code, EHS_COUNTRIES[index]]));

export const TEAM_STAGES = { ...ESCALATION_STAGES, ...EHS_STAGES, closed: "Closed" };
export type TeamStage = keyof typeof TEAM_STAGES;
export interface TeamMember { team_id: string; user_id: string; email: string; role: "admin" | "member" }
export interface Team { id: string; name: string }
export interface TeamProof { reference: string; expiresOn: string }
export interface TeamCase {
  id: string; team_id: string; source_key: string; kind: "ehs" | "inspection" | "registration";
  title: string; country: string; due_on: string; follow_up: string | null; stage: TeamStage;
  context: { site?: string; category?: string; priority?: string; occurredAt?: string; vehicle?: string; originalOwner?: string };
  proof: TeamProof | null; owner_id: string | null; manager_id: string | null; created_by: string;
  reporting: "filed" | "reviewed_not_required" | null; reporting_reference: string | null;
  revision: number; updated_at: string;
}
export interface TeamCaseEvent {
  id: number; actor_email: string; stage: TeamStage; note: string; at: string;
  owner_email: string | null; manager_email: string | null; follow_up: string | null;
}
export interface TeamNotification {
  id: number; team_id: string; case_id: string; event_type: "assigned" | "overdue"; created_at: string; read_at: string | null;
}
export const teamCaseLabels = { ehs: "EHS incident", inspection: "Technical inspection", registration: "Registration renewal" };

export const ehsSource = (item: EhsCase) => "ehs:" + item.id;
export const escalationSource = (item: ComplianceEscalation) => JSON.stringify([item.countryCode, item.vehicleId, item.kind, item.dueOn]);

type CasePublication = {
  p_source: string; p_kind: TeamCase["kind"]; p_title: string; p_country: string;
  p_due: string; p_stage: TeamStage; p_context: TeamCase["context"];
};
export function shareableEhs(item: EhsCase): CasePublication {
  return { p_source: ehsSource(item), p_kind: "ehs", p_title: item.summary.slice(0, 180),
    p_country: EHS_CODES[EHS_COUNTRIES.indexOf(item.country)], p_due: item.due, p_stage: item.stage,
    p_context: { site: item.site, category: item.category, priority: item.priority, occurredAt: item.occurredAt,
      vehicle: item.vehicle, originalOwner: item.owner },
  };
}
export function shareableEscalation(item: ComplianceEscalation, owner: string): CasePublication {
  return { p_source: escalationSource(item), p_kind: item.kind, p_title: (item.plate + " · " + teamCaseLabels[item.kind]).slice(0, 180),
    p_country: item.countryCode, p_due: item.dueOn, p_stage: item.stage,
    p_context: { vehicle: item.vehicleId, originalOwner: owner },
  };
}

export const nextTeamStage = (item: TeamCase): TeamStage | null => ({
  reported: "escalated", open: "escalated", escalated: item.kind === "ehs" ? "contained" : "awaiting_document",
  contained: "corrective", corrective: "closed", awaiting_document: null, closed: null,
})[item.stage] as TeamStage | null;

export type TeamCaseChange = {
  p_id: string; p_revision: number; p_stage: TeamStage; p_owner: string | null; p_manager: string | null;
  p_follow_up: string | null; p_note: string; p_reporting: TeamCase["reporting"];
  p_reporting_reference: string | null; p_proof: TeamProof | null;
};

export async function publishTeamCase(team: string, draft: CasePublication): Promise<string> {
  if (!client) throw new Error("Team cases are unavailable.");
  const result = await client.rpc("fleet_publish_case", { p_team: team, ...draft });
  if (result.error) throw new Error(result.error.message);
  if (typeof result.data !== "string") throw new Error("Case was not saved.");
  return result.data;
}

export async function changeTeamCase(update: TeamCaseChange): Promise<void> {
  if (!client) throw new Error("Team cases are unavailable.");
  const result = await client.rpc("fleet_change_case", update);
  if (result.error) throw new Error(result.error.message);
}

export function verifiedTeamProof(local: ComplianceEscalation): TeamProof | null {
  if (local.stage !== "closed" || !local.proof) return null;
  return { expiresOn: local.proof.expiresOn, reference: (local.proof.reference || local.proof.name).slice(0, 180) };
}
