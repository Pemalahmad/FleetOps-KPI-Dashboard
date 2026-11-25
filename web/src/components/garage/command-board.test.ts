import { describe, expect, it } from "vitest";
import { buildCommandSummary } from "./command-board";
import { localDate, type GarageAlert, type GarageHandover, type GarageVehicle } from "@/lib/garage";

const vehicle = (lane: GarageVehicle["lane"], stage?: NonNullable<GarageVehicle["incident"]>["stage"]): GarageVehicle => ({
  row: { vehicle_id: `${lane}-${stage ?? "none"}` },
  lane,
  incident: stage ? { stage } : null,
} as GarageVehicle);

describe("daily command summary", () => {
  it("counts operational holds and every damage recovery stage", () => {
    const vehicles = [
      vehicle("incident", "reported"), vehicle("incident", "assessment"), vehicle("repair", "repair"),
      vehicle("incident", "quality"), vehicle("dispatch", "ready"), vehicle("renewal"),
    ];
    const alerts = [
      { id: "damage-overdue:1", priority: "critical" },
      { id: "document:2", priority: "warning" },
    ] as GarageAlert[];
    const summary = buildCommandSummary(vehicles, alerts, [], "2026-11-25");
    expect(summary).toMatchObject({ critical: 1, overdueDamage: 1, incidentHolds: 3, renewals: 1, dispatchReady: 1, recoveryOpen: 5 });
    expect(summary.recovery).toEqual({ reported: 1, assessment: 1, repair: 1, quality: 1, ready: 1 });
  });

  it("counts handovers by the operator's local calendar day", () => {
    const localMorning = new Date(2026, 10, 25, 0, 15);
    const handovers = [{ at: localMorning.toISOString() }] as GarageHandover[];
    expect(buildCommandSummary([], [], handovers, localDate(localMorning)).handoversToday).toBe(1);
  });
});
