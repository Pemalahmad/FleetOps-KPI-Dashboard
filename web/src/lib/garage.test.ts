import { describe, expect, it } from "vitest";
import { advanceIncident, assertGarageGeneration, buildAlerts, createDamageCase, damageHandoverBlockers, damageStageBlockers, deriveVehicle, documentCurrent, emptyGarage, emptyReview, normaliseDamageCase, recordHandover, releaseBlockers, reportAccident, updateDamageCase, type DamageCase, type GarageContext, type GarageRow } from "./garage";
import { createTaskQueue } from "./task-queue";

const context: GarageContext = { snapshot: "2026-11-18", today: "2026-11-18", demo: false, operations: true, recallCoverage: true };
const row: GarageRow = {
  vehicle_id: "V-001", plate_number: "D 123", make: "Toyota", model: "Corolla", model_year: 2024, powertrain: "HEV", color: "Silver",
  region: "UAE", home_site_name: "Dubai", is_active: true, registration_status: "Valid", registration_expiry: "2027-03-01",
  registration_days_left: 103, insurance_status: "Valid", insurance_expiry: "2027-04-01", insurance_days_left: 134, insurer: "Example",
  open_jobs: 0, unfinished_jobs: 0, collision_jobs: 0, ready_jobs: 0, work_order_id: "WO-1", job_type: "Repair",
  opened_at: "2026-11-01", key_in_at: "2026-11-01", ready_at: "2026-11-02", key_out_at: "2026-11-02",
  closed_at: "2026-11-02", back_in_service_at: "2026-11-02", repair_revision: "1:closed", pm_state: "OK", has_usage: true, usage_end: "2026-11-17", open_recalls: 0,
};
const signed = (revision: string) => ({ ...emptyReview(revision), owner: "Reviewer", checks: { walkaround: true, road_test: true, handover: true } });
const at = "2026-11-18T10:00:00Z";
const completeDamage = (): DamageCase => {
  const damage = createDamageCase(at, "Recovery lead");
  damage.severity = "moderate"; damage.drivability = "not_drivable"; damage.hold.reason = "Collision assessment";
  for (const note of Object.values(damage.notifications)) Object.assign(note, { required: true, status: "sent", dueAt: "2026-11-18T11:00:00Z", sentAt: at, notifiedBy: "Recovery lead", reference: "REF-1" });
  for (const evidence of Object.values(damage.evidence)) Object.assign(evidence, { complete: true, reference: "DOC-1", recordedAt: at });
  damage.estimate = { supplier: "Repair Co", currency: "AED", amount: 2500, reference: "EST-1", receivedAt: at };
  damage.authorization = { status: "approved", approvedBy: "Fleet manager", decidedAt: at, reference: "AUTH-1", reason: "" };
  damage.repair = { supplier: "Repair Co", workOrder: "WO-2", startedAt: at, completedAt: "2026-11-18T12:00:00Z", invoiceReference: "INV-1", completionReference: "COMP-1" };
  damage.quality = { reviewer: "Quality lead", reviewedAt: "2026-11-18T13:00:00Z", reference: "QA-1", checks: { scope_complete: true, safety_defects_clear: true, warning_lights_clear: true, road_or_functional_test: true, final_photos: true } };
  return damage;
};
const incident = { id: "INC-1", vehicleId: row.vehicle_id, summary: "Rear bumper impact", owner: "Recovery lead", occurredAt: "2026-11-18T09:00:00Z", damage: completeDamage() };
describe("garage source gates and lanes", () => {
  it("recognises a fully assessed vehicle and records only raw milestones", () => {
    const v = deriveVehicle(row, emptyGarage(), context);
    expect(v.lane).toBe("road"); expect(v.readiness).toBe(5);
    expect(deriveVehicle({ ...row, ready_at: null }, emptyGarage(), context).milestones[2].at).toBeNull();
  });
  it("keeps expired registration and unknown insurance out of the road-ready zone", () => {
    expect(deriveVehicle({ ...row, registration_expiry: "2026-11-17" }, emptyGarage(), context).lane).toBe("renewal");
    expect(deriveVehicle({ ...row, insurance_expiry: null }, emptyGarage(), context).sourceClear).toBe(false);
    expect(documentCurrent("2026-11-18", context.today)).toBe(true);
    expect(documentCurrent("2026-02-30", context.today)).toBeNull();
  });
  it("prioritises accidents and never lets one ready job conceal another unfinished job", () => {
    const jobs = { ...row, open_jobs: 2, ready_jobs: 1, unfinished_jobs: 1 };
    expect(deriveVehicle(jobs, emptyGarage(), context).lane).toBe("repair");
    expect(deriveVehicle({ ...jobs, collision_jobs: 1 }, emptyGarage(), context).lane).toBe("incident");
    expect(releaseBlockers(jobs, emptyGarage(), context, signed(deriveVehicle(jobs, emptyGarage(), context).revision))).toContain("Repair orders closed: 2 work order(s) remain open");
  });
  it("shows maintenance and recall evidence gaps even when the registry looks compliant", () => {
    expect(deriveVehicle({ ...row, has_usage: false }, emptyGarage(), context).lane).toBe("verify");
    expect(deriveVehicle(row, emptyGarage(), { ...context, recallCoverage: false }).lane).toBe("verify");
    expect(deriveVehicle(row, emptyGarage(), { ...context, operations: false }).sourceClear).toBe(false);
    expect(deriveVehicle({ ...row, open_recalls: 1 }, emptyGarage(), context).sourceClear).toBe(false);
    expect(deriveVehicle({ ...row, usage_end: "2026-08-31" }, emptyGarage(), context).sourceClear).toBe(false);
  });
  it("rechecks expiry and stale source records at actual handover time", () => {
    const old = { ...context, snapshot: "2026-10-01" };
    const v = deriveVehicle({ ...row, registration_expiry: "2026-10-20" }, emptyGarage(), old);
    expect(v.gates[0].status).toBe("pass");
    expect(releaseBlockers(v.row, emptyGarage(), old, signed(v.revision)).some((s) => s.startsWith("Registration current"))).toBe(true);
    expect(releaseBlockers(row, emptyGarage(), old, signed(deriveVehicle(row, emptyGarage(), old).revision)).some((s) => s.startsWith("Current source records"))).toBe(true);
  });
});
describe("recorded recovery operations", () => {
  it("normalises legacy incidents to an active hold and blocks incomplete progression", () => {
    const legacy = { ...incident, damage: undefined, stage: "reported" as const, createdAt: at, updatedAt: at };
    const damage = normaliseDamageCase(legacy);
    expect(damage.hold.active).toBe(true);
    expect(damageStageBlockers(legacy)).toContain("Classify damage severity.");
  });
  it("derives mandatory police and insurer decisions from safety facts", () => {
    const damage = createDamageCase(at, "Lead");
    damage.severity = "minor"; damage.drivability = "drivable"; damage.facts.thirdParty = true;
    damage.notifications.police = { ...damage.notifications.police, required: false, status: "not_required", waiverReason: "Initially considered internal" };
    const normal = normaliseDamageCase({ ...incident, damage, createdAt: at, owner: "Lead" });
    expect(normal.notifications.police.required).toBe(true);
    expect(normal.notifications.insurer.required).toBe(true);
  });
  it("keeps history append-only and invalidates an existing review on damage updates", () => {
    let state = reportAccident(emptyGarage(), incident, at);
    const current = deriveVehicle(row, state, context);
    state = { ...state, reviews: { [row.vehicle_id]: signed(current.revision) } };
    const before = normaliseDamageCase(state.incidents[0]).history;
    state = updateDamageCase(state, incident.id, { ...normaliseDamageCase(state.incidents[0]), hold: { ...normaliseDamageCase(state.incidents[0]).hold, reason: "Updated hold" } }, "Manager", "2026-11-18T10:05:00Z");
    expect(normaliseDamageCase(state.incidents[0]).history.slice(0, before.length)).toEqual(before);
    expect(state.reviews[row.vehicle_id]).toBeUndefined();
  });
  it("holds a reported accident, emits an alert and advances through each recovery stage", () => {
    let state = reportAccident(emptyGarage(), incident, at);
    expect(deriveVehicle(row, state, context).lane).toBe("incident");
    expect(buildAlerts([deriveVehicle(row, state, context)])[0].priority).toBe("critical");
    state = advanceIncident(state, incident.id, at);
    state = advanceIncident(state, incident.id, at);
    expect(deriveVehicle(row, state, context).lane).toBe("repair");
    state = advanceIncident(state, incident.id, at);
    state = advanceIncident(state, incident.id, at);
    expect(deriveVehicle(row, state, context).lane).toBe("dispatch");
    expect(() => advanceIncident(state, incident.id, at)).toThrow("checklist");
  });
  it("rejects duplicate active incidents and invalid event times", () => {
    const state = reportAccident(emptyGarage(), incident, at);
    expect(reportAccident(state, incident, at)).toBe(state);
    expect(() => reportAccident(state, { ...incident, id: "INC-2" }, at)).toThrow("already has");
    expect(() => reportAccident(emptyGarage(), { ...incident, occurredAt: "2026-11-19T12:00:00Z" }, at)).toThrow("future");
  });
  it("resets manual checks when incidents or source work-order evidence changes", () => {
    const v = deriveVehicle(row, emptyGarage(), context), state = { ...emptyGarage(), reviews: { [row.vehicle_id]: { ...signed(v.revision), notes: "Prior repair evidence" } } };
    expect(deriveVehicle({ ...row, repair_revision: "new-job" }, state, context).review.checks.walkaround).toBe(false);
    expect(deriveVehicle(row, reportAccident(state, incident, at), context).review.checks.walkaround).toBe(false);
    expect(reportAccident(state, incident, at).reviewHistory?.[0].review.notes).toBe("Prior repair evidence");
  });
  it("requires source gates, reviewer and checks before recording a handover", () => {
    const state = emptyGarage(), v = deriveVehicle(row, state, context);
    expect(() => recordHandover(state, row, context, emptyReview(v.revision), at)).toThrow("person");
    const blocked = { ...row, insurance_expiry: "2026-01-01" };
    expect(() => recordHandover(state, blocked, context, signed(deriveVehicle(blocked, state, context).revision), at)).toThrow("Insurance");
  });
  it("records a handover once and closes only the reviewed vehicle's incident", () => {
    let state = reportAccident(emptyGarage(), incident, at);
    for (let i = 0; i < 4; i++) state = advanceIncident(state, incident.id, at);
    const review = signed(deriveVehicle(row, state, context).revision);
    const released = recordHandover(state, row, context, review, at);
    expect(released.incidents[0].resolvedAt).toBe(at);
    expect(deriveVehicle(row, released, context).lane).toBe("road");
    expect(recordHandover(released, row, context, review, at)).toBe(released);
    expect(recordHandover(released, row, context, deriveVehicle(row, released, context).review, at)).toBe(released);
    expect(released.handovers).toHaveLength(1);
    expect(released.handovers[0].review.checks.walkaround).toBe(true);
    expect(released.handovers[0].source.every((g) => g.status === "pass")).toBe(true);
    expect(released.handovers[0].damageSnapshot?.hold.active).toBe(true);
    expect(normaliseDamageCase(released.incidents[0]).hold.active).toBe(false);
    expect(damageHandoverBlockers({ ...released.incidents[0], stage: "ready", resolvedAt: undefined }, at)).toContain("The vehicle damage hold must remain active until handover.");
  });
  it("rejects a queued handover when an earlier queued import rebuilds the report", async () => {
    const queue = createTaskQueue();
    let generation = 1, signedOff = false;
    const expected = generation;
    const imported = queue(async () => { generation += 1; });
    const handover = queue(async () => { assertGarageGeneration(expected, generation); signedOff = true; });
    await imported;
    await expect(handover).rejects.toThrow("fleet report changed");
    expect(signedOff).toBe(false);
  });
  it("archives the prior source review even when the new draft goes directly to handover", () => {
    const before = deriveVehicle(row, emptyGarage(), context);
    const state = { ...emptyGarage(), reviews: { [row.vehicle_id]: { ...signed(before.revision), notes: "Earlier evidence" } } };
    const refreshed = { ...row, repair_revision: "2:closed" };
    const draft = { ...signed(deriveVehicle(refreshed, state, context).revision), notes: "Current evidence" };
    const result = recordHandover(state, refreshed, context, draft, at);
    expect(result.reviewHistory?.[0].review.notes).toBe("Earlier evidence");
    expect(result.handovers[0].review.notes).toBe("Current evidence");
  });
});
