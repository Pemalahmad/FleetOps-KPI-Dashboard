import { describe, expect, it } from "vitest";
import {
  TYRES, advanceOrder, addComment, emptyService, holdOrder, isServiceState, nextStage, orderTotals, scheduleOrder, serviceReport, stageBlockers,
  updateOrder, vehicleHistory, type ConditionCheck, type ServiceState,
} from "./service";
import { demoService } from "./service-demo";

const at = (h: number) => new Date(Date.UTC(2026, 10, 20, 8) + h * 36e5).toISOString();
const check = (km: number, when: string): ConditionCheck => ({ at: when, by: "Lina", odometerKm: km, energyPct: 60, exterior: "Clean", interior: "Clean",
  warningLights: "None", damage: false, tyres: TYRES.map((position) => ({ position, treadMm: 5, pressurePsi: 38, state: "good" as const })) });
const booked = () => scheduleOrder(emptyService(), { id: "SO-1", vehicleId: "V-1", plate: "D 123", vehicleLabel: "Toyota Corolla", advisor: "Lina",
  scheduledFor: at(1), concern: "Front brakes grinding", payType: "customer" }, at(0));
const stage = (s: ServiceState) => s.orders[0].stage;

/** Drive one order through every gate to Delivered. */
function deliver(payType: "customer" | "warranty" = "customer") {
  let s = scheduleOrder(emptyService(), { id: "SO-1", vehicleId: "V-1", plate: "D 123", vehicleLabel: "Corolla", advisor: "Lina", scheduledFor: at(1), concern: "Noise", payType }, at(0));
  s = updateOrder(s, "SO-1", (o) => ({ ...o, checkIn: check(41000, at(1)) }), at(1));
  s = advanceOrder(s, "SO-1", { assignedTo: "Lina", by: "Lina" }, at(1));
  s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Lina" }, at(2));
  s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Ahmed" }, at(3));
  s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Ahmed" }, at(4));
  s = updateOrder(s, "SO-1", (o) => ({ ...o, lines: o.lines.map((l) => ({ ...l, diagnosis: "Pads worn", correction: "Replaced pads", estimatedHours: 2,
    claimRef: payType === "warranty" ? "WC-1" : "", parts: [{ id: "P1", partNumber: "BP-1", description: "Pad set", qty: 1, unitPrice: 100 }] })),
    time: [{ id: "T1", tech: "Ahmed", lineId: o.lines[0].id, hours: 2.5, at: at(4), note: "" }] }), at(4));
  s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Ahmed" }, at(5));
  s = updateOrder(s, "SO-1", (o) => ({ ...o, checkOut: check(41008, at(6)), invoice: { ...o.invoice, number: "INV-1", status: "issued", issuedAt: at(6) } }), at(6));
  return advanceOrder(s, "SO-1", { assignedTo: "Lina", by: "Lina" }, at(6));
}

describe("service order sequence and gates", () => {
  it("follows Scheduled → Arrived → Service ready → In service → Diagnosis → Service complete → Delivered", () => {
    const s = deliver();
    expect(s.orders[0].history.map((h) => h.stage)).toEqual(["scheduled", "arrived", "service_ready", "in_service", "diagnosis", "service_complete", "delivered"]);
    expect(s.orders[0].history.slice(2).every((h) => h.assignedTo)).toBe(true);
    expect(s.technicians).toEqual(["Ahmed", "Lina"]);
  });

  it("will not mark a vehicle arrived without the odometer, condition and all four tyres", () => {
    expect(stageBlockers(booked().orders[0], "")).toContain("Record the check-in: odometer, vehicle condition and all four tyres.");
    const threeTyres = updateOrder(booked(), "SO-1", (o) => ({ ...o, checkIn: { ...check(1000, at(1)), tyres: check(1000, at(1)).tyres.slice(0, 3) } }), at(1));
    expect(() => advanceOrder(threeTyres, "SO-1", { assignedTo: "", by: "Lina" }, at(1))).toThrow("all four tyres");
  });

  it("requires a technician for each stage after arrival", () => {
    let s = updateOrder(booked(), "SO-1", (o) => ({ ...o, checkIn: check(1000, at(1)) }), at(1));
    s = advanceOrder(s, "SO-1", { assignedTo: "", by: "Lina" }, at(1));
    expect(() => advanceOrder(s, "SO-1", { assignedTo: " ", by: "Lina" }, at(2))).toThrow("Assign");
  });

  it("will not complete without diagnosis, work done, estimate, claim reference for warranty, and logged hours", () => {
    let s = updateOrder(booked(), "SO-1", (o) => ({ ...o, checkIn: check(1000, at(1)), lines: o.lines.map((l) => ({ ...l, payType: "warranty" as const })) }), at(1));
    for (const [i, who] of [["Lina", "Lina"], ["Ahmed", "Lina"], ["Ahmed", "Ahmed"], ["Ahmed", "Ahmed"]].entries()) s = advanceOrder(s, "SO-1", { assignedTo: who[0], by: who[1] }, at(2 + i));
    const blockers = stageBlockers(s.orders[0], "Ahmed").join(" ");
    for (const need of ["diagnosis", "work done", "warranty claim", "estimated labour hours", "technician hours"]) expect(blockers).toContain(need);
  });

  it("will not deliver without the odometer out and an issued invoice, and odometer out cannot go backwards", () => {
    const s = deliver();
    expect(stage(s)).toBe("delivered");
    const o = s.orders[0];
    expect(stageBlockers({ ...o, stage: "service_complete", checkOut: null }, "Lina")).toContain("Record the odometer and condition at delivery.");
    expect(stageBlockers({ ...o, stage: "service_complete", invoice: { ...o.invoice, status: "draft" } }, "Lina").join(" ")).toContain("Issue the invoice");
    expect(() => updateOrder(booked(), "SO-1", (x) => ({ ...x, checkIn: check(5000, at(1)), checkOut: check(4000, at(2)) }), at(2))).toThrow("Odometer out");
  });

  it("holds from any active stage with a reason and resumes to the stage it left", () => {
    let s = updateOrder(booked(), "SO-1", (o) => ({ ...o, checkIn: check(1000, at(1)) }), at(1));
    expect(() => holdOrder(s, "SO-1", { reason: "Parts", by: "Lina", assignedTo: "" }, at(1))).toThrow("active");
    s = advanceOrder(s, "SO-1", { assignedTo: "Lina", by: "Lina" }, at(1));
    s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Lina" }, at(2));
    s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Ahmed" }, at(3));   // in service
    expect(() => holdOrder(s, "SO-1", { reason: "", by: "Ahmed", assignedTo: "Ahmed" }, at(4))).toThrow("reason");
    s = holdOrder(s, "SO-1", { reason: "Waiting for parts", by: "Ahmed", assignedTo: "Ahmed" }, at(4));
    expect(stage(s)).toBe("on_hold"); expect(nextStage(s.orders[0])).toBe("in_service");
    s = advanceOrder(s, "SO-1", { assignedTo: "Ahmed", by: "Ahmed" }, at(9));
    expect(stage(s)).toBe("in_service"); expect(s.orders[0].history.at(-1)!.note).toContain("Waiting for parts");
  });

  it("keeps stage history and comments out of record edits, and closes delivered orders to edits but not comments", () => {
    const s = deliver();
    expect(() => updateOrder(s, "SO-1", (o) => o, at(7))).toThrow("closed");
    const c = addComment(s, "SO-1", { author: "Fleet owner", role: "owner", text: "Book the next service at 50,000 km" }, at(7));
    expect(c.orders[0].comments.at(-1)!.role).toBe("owner");
    const forged = updateOrder(booked(), "SO-1", (o) => ({ ...o, stage: "delivered", history: [] }), at(1));
    expect(forged.orders[0].stage).toBe("scheduled"); expect(forged.orders[0].history).toHaveLength(1);
  });

  it("refuses a second open order for the same vehicle and impossible readings", () => {
    expect(() => scheduleOrder(booked(), { id: "SO-2", vehicleId: "V-1", plate: "D 123", vehicleLabel: "", advisor: "Lina", scheduledFor: at(2), concern: "Wipers", payType: "customer" }, at(1))).toThrow("open service order");
    expect(() => updateOrder(booked(), "SO-1", (o) => ({ ...o, checkIn: { ...check(1000, at(1)), energyPct: 140 } }), at(1))).toThrow("0 to 100");
    expect(() => updateOrder(booked(), "SO-1", (o) => ({ ...o, time: [{ id: "T", tech: "A", lineId: null, hours: 30, at: at(1), note: "" }] }), at(1))).toThrow("24 hours");
  });
});

describe("totals, reports and vehicle history", () => {
  it("splits labour and parts by pay type and measures technician efficiency", () => {
    const t = orderTotals(deliver().orders[0]);
    expect(t.byPay.customer).toEqual({ labour: 190, parts: 100, total: 290 });
    expect(t.customerTotal).toBe(290); expect(t.claimTotal).toBe(0);
    expect(t.actualHours).toBe(2.5); expect(t.efficiency).toBeCloseTo(0.8, 5);
    const w = orderTotals(deliver("warranty").orders[0]);
    expect(w.claimTotal).toBe(290); expect(w.customerTotal).toBe(0);
  });

  it("reports stages, holds, technicians, pay mix and dwell", () => {
    const r = serviceReport(deliver(), at(10));
    expect(r.byStage.delivered).toBe(1); expect(r.deliveredLast7).toBe(1);
    expect(r.avgDwellHours).toBeCloseTo(5, 5);
    expect(r.technicians.find((x) => x.tech === "Ahmed")).toMatchObject({ hours: 2.5, estimated: 2 });
    expect(r.customerRevenue).toBe(290);
  });

  it("lists a vehicle's visits with odometer in and out and tyre readings", () => {
    const [visit] = vehicleHistory(deliver(), "V-1");
    expect(visit).toMatchObject({ odometerIn: 41000, odometerOut: 41008 });
    expect(visit.tyres).toHaveLength(4);
  });
});

describe("demo service board", () => {
  const vehicles = Array.from({ length: 60 }, (_, i) => ({ vehicle_id: `V${i}`, plate_number: `DXB ${1000 + i}`, make: "Toyota", model: "Camry" }));
  it("fills every stage through the real rules, deterministically", () => {
    const s = demoService(vehicles, "2026-11-23T10:00:00Z");
    expect(s).toEqual(demoService(vehicles, "2026-11-23T10:00:00Z"));
    const r = serviceReport(s, "2026-11-23T10:00:00Z");
    for (const n of Object.values(r.byStage)) expect(n).toBeGreaterThan(0);
    expect(isServiceState(s)).toBe(true);
    for (const o of s.orders) expect(new Set(o.history.map((h) => h.at)).size).toBeGreaterThan(0);
  });
  it("rejects malformed stored state", () => {
    expect(isServiceState({ version: 1, orders: [{ id: "x", stage: "teleported" }], technicians: [] })).toBe(false);
    expect(isServiceState(null)).toBe(false);
  });
});
