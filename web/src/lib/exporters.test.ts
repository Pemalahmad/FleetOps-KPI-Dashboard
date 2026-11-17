import { describe, expect, it } from "vitest";
import { renewalsIcs, safeCell, safeRows } from "./exporters";

describe("calendar reminders (.ics)", () => {
  const ics = renewalsIcs([
    { vehicle: "D 48213", kind: "Registration", date: "2027-03-12", detail: "RTA" },
    { vehicle: "K, 11; x", kind: "Insurance", date: "2026-12-31" },
  ], new Date("2026-11-17T10:00:00Z"));
  it("is a valid calendar with one all-day event and two alarms per renewal", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(4);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270312\r\nDTEND;VALUE=DATE:20270313");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");          // end date rolls into the next year
    expect(ics).toContain("TRIGGER:-P30D");
  });
  it("escapes commas and semicolons, folds long lines, keeps stable ids", () => {
    expect(ics).toContain("K\\, 11\\; x");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(ics).toContain("UID:registration-D48213-20270312@fleetops");
  });
});

describe("spreadsheet formula injection", () => {
  it("neutralises cells that a spreadsheet would execute", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(safeCell("+1+1")).toBe("'+1+1");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("-2+3")).toBe("'-2+3");
  });
  it("leaves ordinary values and numbers alone", () => {
    expect(safeCell("D 48213")).toBe("D 48213");
    expect(safeCell(-12.5)).toBe(-12.5);
    expect(safeCell(null)).toBeNull();
    expect(safeRows([{ vin: "=cmd", n: 3 }])).toEqual([{ vin: "'=cmd", n: 3 }]);
  });
});
