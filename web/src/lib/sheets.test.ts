import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { guessMapping, guessTable, headerRow, knownHeaders, readFile, toCsv, type TableLike } from "./sheets";

// The real contract, as exported by `fleetkpi web-export` (CI runs the export before the tests).
const manifestPath = join(__dirname, "..", "..", "public", "engine", "manifest.json");
const tables: TableLike[] = JSON.parse(readFileSync(manifestPath, "utf8")).tables;
const T = (n: string) => tables.find((t) => t.name === n)!;

describe("table and column guessing", () => {
  it("recognises exports from common fleet platforms as the vehicle register", () => {
    const fleetioLike = ["Name", "VIN/SN", "Year", "Make", "Model", "Trim", "License Plate", "Status", "Group"];
    const g = guessTable({ headers: fleetioLike, file: "vehicles_export.csv", sheet: null }, tables);
    expect(g.table).toBe("vehicles");
    expect(g.mapping).toMatchObject({ vehicle_id: "Name", vin: "VIN/SN", model_year: "Year", trim: "Trim", plate_number: "License Plate" });
    const motiveLike = ["Vehicle Number", "VIN", "Make", "Model", "Year", "License Plate"];
    expect(guessTable({ headers: motiveLike, file: "export.csv", sheet: null }, tables).mapping.vehicle_id).toBe("Vehicle Number");
  });

  it("lets a plate be both the id and the plate, but never reuses ordinary columns", () => {
    const m = guessMapping(["Plate", "Chassis No", "Fuel", "Brand"], T("vehicles"));
    expect(m).toMatchObject({ vehicle_id: "Plate", plate_number: "Plate", vin: "Chassis No", powertrain: "Fuel", make: "Brand" });
    expect(m.fuel_type).toBeNull();
  });

  it("recognises a registration-card list as documents", () => {
    const g = guessTable({ headers: ["Plate No", "Document Type", "Expiry", "Issued By"], file: "mulkiya cards.xlsx", sheet: null }, tables);
    expect(g.table).toBe("documents");
    expect(g.mapping).toMatchObject({ vehicle_ref: "Plate No", doc_type: "Document Type", expiry_date: "Expiry" });
  });

  it("refuses to guess on unrelated sheets", () => {
    expect(guessTable({ headers: ["Foo", "Bar", "Baz"], file: "notes.xlsx", sheet: "Sheet1" }, tables).table).toBeNull();
  });
});

describe("reading workbooks", () => {
  it("finds the header row under title rows and keeps Excel dates as ISO dates", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Sahra Mobility · fleet register"], [],
      ["Plate", "VIN", "Make", "Model Year", "Registration Expiry"],
      ["D 48213", "1HGCM82633A004352", "Honda", 2003, new Date(2027, 2, 12)],
      ["K 11", "1M8GDM9AXKP042788", "Motor Coach", 2019, new Date(2026, 11, 1)],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fleet");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["just a note"]]), "Notes");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buf], "fleet.xlsx");
    const sheets = await readFile(file, tables);
    expect(sheets).toHaveLength(1);                       // the one-cell notes sheet is ignored
    expect(sheets[0].headers).toEqual(["Plate", "VIN", "Make", "Model Year", "Registration Expiry"]);
    expect(sheets[0].rows[0]).toEqual(["D 48213", "1HGCM82633A004352", "Honda", "2003", "2027-03-12"]);
    expect(toCsv(sheets[0]).split("\n")[1]).toBe("D 48213,1HGCM82633A004352,Honda,2003,2027-03-12");
    expect(guessTable(sheets[0], tables).table).toBe("vehicles");
  });

  it("header detection prefers known column names", () => {
    const known = knownHeaders(tables);
    expect(headerRow([["Report", "2026"], ["x", "y", "z"], ["VIN", "Make", "Model"]], known)).toBe(2);
  });
});
