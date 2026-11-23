import { describe, expect, it } from "vitest";
import type { PipelineLog } from "./engine";
import { parseSop, sopProgressKey, sopSignal } from "./sops";

const log: PipelineLog = {
  ok: true, mode: "operations", dataset: "Test", snapshot: "2026-11-01", stages: [], models: [], tests: [], totalMs: 0, issues: [],
  loads: ["vehicles", "work_orders"].map((table) => ({ table, source: table + ".csv", rows: 1, mapped: {}, missingRequired: [] })),
};
describe("SOP evidence and progress scope", () => {
  it("parses CRLF procedures and preserves exit criteria separately from checkboxes", () => {
    const sop = parseSop("test.md", "---\r\nid: SOP-05\r\ntitle: PM review\r\n---\r\n## Steps\r\n- [ ] Check source\r\n\r\n## Exit criteria\r\nEvidence reconciled.");
    expect(sop.meta.id).toBe("SOP-05");
    expect(sop.steps).toEqual(["Check source"]);
    expect(sop.guidance).toContain("Evidence reconciled.");
    expect(sop.guidance).not.toContain("- [ ]");
    expect(sopProgressKey("demo", "Fleet", "A", "2026-11-01", sop)).not.toBe(sopProgressKey("mine", "Fleet", "A", "2026-11-01", sop));
    expect(sopProgressKey("mine", "Fleet", "A", "2026-11-01", sop)).not.toBe(sopProgressKey("mine", "Fleet", "B", "2026-11-01", sop));
  });
  it("flags overdue maintenance without depending on manual checklist progress", () => {
    expect(sopSignal("SOP-05", log, { "SOP-05": 2 }, {}, {}).state).toBe("active");
    expect(sopSignal("SOP-05", log, { "SOP-05": 0 }, {}, {}).state).toBe("routine");
  });
  it("does not present missing, failed or unloaded evidence as healthy", () => {
    expect(sopSignal("SOP-05", log, null, {}, {}).state).toBe("unknown");
    expect(sopSignal("SOP-05", { ...log, ok: false }, { "SOP-05": 0 }, {}, {}).state).toBe("unknown");
    expect(sopSignal("SOP-08", log, { "SOP-08": 0 }, {}, {}).state).toBe("unknown");
  });
  it("uses configured target direction for parts and repeat repair triggers", () => {
    expect(sopSignal("SOP-03", log, { "SOP-03": 0 }, { parts: 80 }, { parts_on_time_pct: { green: 95, direction: "higher" } }).state).toBe("active");
  });
  it("activates the damage escalation procedure only from recorded open cases", () => {
    expect(sopSignal("SOP-09", log, { "SOP-09": 2 }, {}, {})).toEqual({ state: "active", reason: "2 open vehicle damage escalations" });
    expect(sopSignal("SOP-09", log, { "SOP-09": null }, {}, {}).state).toBe("unknown");
    expect(sopSignal("SOP-09", log, { "SOP-09": 0 }, {}, {}).state).toBe("routine");
  });
});
