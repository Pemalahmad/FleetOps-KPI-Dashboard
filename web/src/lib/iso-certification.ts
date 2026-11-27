export const ISO_STANDARDS = ["ISO 39001:2012", "ISO 45001:2018", "ISO 14001:2026", "ISO 14001:2015", "ISO 9001:2026", "ISO 9001:2015"] as const;
export const ISO_KINDS = { certificate: "Certificates", audit: "Audits", finding: "Findings" } as const;
export const ISO_STATUS = {
  certificate: { planned: "Planned", pending_verification: "Pending verification", verified: "Verified", suspended: "Suspended", withdrawn: "Withdrawn", superseded: "Superseded" },
  audit: { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" },
  finding: { open: "Open", in_progress: "In progress", resolved: "Resolved" },
} as const;
export const AUDIT_TYPES = { internal: "Internal", initial: "Initial certification", surveillance: "Surveillance", recertification: "Recertification" } as const;
export type IsoKind = keyof typeof ISO_KINDS;

export interface IsoDraft {
  kind: IsoKind;
  title: string;
  status: string;
  certificate_id: string | null;
  audit_id: string | null;
  standard: string | null;
  entity: string | null;
  sites: string | null;
  scope: string | null;
  issuer: string | null;
  certificate_number: string | null;
  issue_on: string | null;
  due_on: string | null;
  closed_on: string | null;
  audit_type: string | null;
  severity: string | null;
  owner_id: string;
  manager_id: string;
  evidence: string | null;
  notes: string | null;
}
export interface IsoRecord extends IsoDraft {
  id: string;
  team_id: string;
  created_by: string;
  checked_at: string | null;
  checked_by: string | null;
  escalated_at: string | null;
  revision: number;
}
export interface IsoEvent {
  id: number;
  actor: string;
  action: "created" | "updated" | "verified" | "escalated" | "resolved";
  at: string;
  snapshot: IsoRecord;
}

export const dubaiToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const daysFrom = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);

export function isoStatus(item: IsoDraft, today: string): { label: string; tone: "bad" | "warn" | "good" | "muted" } {
  const remaining = item.due_on ? daysFrom(item.due_on, today) : Infinity;
  if (item.kind === "certificate" && item.status === "verified") {
    if (remaining < 0) return { label: "Expired", tone: "bad" };
    return remaining <= 90 ? { label: "Renewal due", tone: "warn" } : { label: "Verified active", tone: "good" };
  }
  if (item.kind === "certificate" && item.status === "suspended") return { label: "Suspended", tone: "bad" };
  if (remaining < 0 && (item.kind === "finding" && item.status !== "resolved" || item.kind === "audit" && item.status === "scheduled")) {
    return { label: "Overdue", tone: "bad" };
  }
  const labels: Readonly<Record<string, string>> = ISO_STATUS[item.kind];
  return { label: labels[item.status] ?? item.status, tone: item.status === "resolved" || item.status === "completed" ? "good" : "muted" };
}
