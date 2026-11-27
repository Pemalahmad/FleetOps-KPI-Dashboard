import { describe, expect, it } from "vitest";
import { isoStatus, type IsoDraft } from "./iso-certification";

const record = (kind: IsoDraft["kind"], status: string, due_on: string | null): IsoDraft => ({
  kind, status, due_on, title: "Synthetic", certificate_id: null, audit_id: null, standard: null, entity: null, sites: null,
  scope: null, issuer: null, certificate_number: null, issue_on: null, closed_on: null, audit_type: null, severity: null,
  owner_id: "owner", manager_id: "manager", evidence: null, notes: null,
});
describe("ISO status", () => {
  const today = "2026-11-27";
  it("derives expiry and upcoming renewal without obscuring the issuer status", () => {
    expect(isoStatus(record("certificate","verified","2027-03-01"),today).label).toBe("Verified active");
    expect(isoStatus(record("certificate","verified","2027-01-10"),today).label).toBe("Renewal due");
    expect(isoStatus(record("certificate","verified","2026-11-27"),today).label).toBe("Renewal due");
    expect(isoStatus(record("certificate","verified","2026-11-26"),today).label).toBe("Expired");
    expect(isoStatus(record("certificate","suspended","2026-11-26"),today).label).toBe("Suspended");
  });
  it("preserves completed audits and resolved findings after the deadline", () => {
    expect(isoStatus(record("audit","completed","2026-11-26"),today).label).toBe("Completed");
    expect(isoStatus(record("finding","resolved","2026-11-26"),today).label).toBe("Resolved");
    expect(isoStatus(record("finding","open","2026-11-26"),today).label).toBe("Overdue");
  });
});
