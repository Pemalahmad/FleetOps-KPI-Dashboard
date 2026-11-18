import { describe, expect, it } from "vitest";
import { emptyWorkspace, isActivityEntry, withActivity } from "./workspace";

describe("activity log", () => {
  it("appends entries, newest last", () => {
    let ws = emptyWorkspace();
    ws = withActivity(ws, "data", "Fleet data saved: 2 sheets", "2026-11-18T10:00:00Z");
    ws = withActivity(ws, "garage", "Handover recorded for V1", "2026-11-18T10:01:00Z");
    expect(ws.activity?.map((a) => a.kind)).toEqual(["data", "garage"]);
  });
  it("merges repeated saves of the same thing within ten minutes", () => {
    let ws = emptyWorkspace();
    ws = withActivity(ws, "procedure", "Procedure SOP-02 updated (1 steps checked)", "2026-11-18T10:00:00Z");
    ws = withActivity(ws, "procedure", "Procedure SOP-02 updated (3 steps checked)", "2026-11-18T10:05:00Z");
    expect(ws.activity).toHaveLength(1);
    expect(ws.activity?.[0].detail).toContain("3 steps");
    ws = withActivity(ws, "procedure", "Procedure SOP-02 updated (4 steps checked)", "2026-11-18T10:30:00Z");
    expect(ws.activity).toHaveLength(2);
  });
  it("keeps only the newest 400 entries", () => {
    let ws = emptyWorkspace();
    for (let i = 0; i < 450; i++) ws = withActivity(ws, "garage", `Accident reported for V${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
    expect(ws.activity).toHaveLength(400);
    expect(ws.activity?.at(-1)?.detail).toBe("Accident reported for V449");
  });
  it("rejects malformed stored entries", () => {
    expect(isActivityEntry({ at: "x", kind: "data", detail: "ok" })).toBe(true);
    expect(isActivityEntry({ at: "x", kind: "root", detail: "ok" })).toBe(false);
    expect(isActivityEntry(null)).toBe(false);
  });
});
