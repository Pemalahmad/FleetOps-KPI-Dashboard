import { expect, it } from "vitest";
import { emptyGarage } from "./garage";
import { reportEhsCase, updateEhsCase } from "./ehs";

it("keeps an EHS case open until containment, corrective action and independent verification are recorded", () => {
  const now = new Date(2026, 10, 18, 12);
  const at = now.toISOString(), id = "EHS-1";
  const reported = reportEhsCase(emptyGarage(), {
    country: "Bahrain", category: "Near miss", priority: "critical", site: "Workshop", vehicle: "V1",
    summary: "Unsecured load", reporter: "Shift lead", occurredAt: at,
  }, id, now);
  expect(reported.ehsCases?.[0]).toMatchObject({ stage: "reported", due: "2026-11-18" });
  const update = { owner: "Safety lead", manager: "Duty manager", due: "2026-11-18",
    actor: "Safety lead", detail: "Barrier and inspection record", notification: "pending" as const, authorityRecord: "" };
  expect(() => updateEhsCase(reported, id, "closed", update, at)).toThrow("current SOP step");
  const escalated = updateEhsCase(reported, id, "escalated", update, at);
  const contained = updateEhsCase(escalated, id, "contained", update, at);
  const corrective = updateEhsCase(contained, id, "corrective", update, at);
  expect(() => updateEhsCase(corrective, id, "closed", update, at)).toThrow("external reporting review");
  const review = { ...update, notification: "not_required" as const, authorityRecord: "EHS lead decision EHS-92" };
  expect(() => updateEhsCase(corrective, id, "closed", review, at)).toThrow("A reviewer other than the case owner");
  const closed = updateEhsCase(corrective, id, "closed", { ...review, actor: "Regional reviewer" }, at);
  expect(closed.ehsCases?.[0]?.history.map((entry) => entry.stage)).toEqual(["reported", "escalated", "contained", "corrective", "closed"]);
  expect(closed.ehsCases?.[0]).toMatchObject({ stage: "closed", authorityRecord: "EHS lead decision EHS-92", owner: "Safety lead", manager: "Duty manager" });
});
