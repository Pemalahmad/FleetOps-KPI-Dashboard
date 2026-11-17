import { describe, expect, it } from "vitest";
import { asciiDigits, extractFields, findDates, isSafeDocumentPreview, readDocument } from "./docscan";

it("rejects executable document types before scanning or previewing", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml"]) {
    expect(isSafeDocumentPreview(type)).toBe(false);
    await expect(readDocument("", new Blob(["<script>alert(1)</script>"], { type }))).rejects.toThrow("not supported");
  }
  expect(isSafeDocumentPreview("application/pdf")).toBe(true);
  expect(isSafeDocumentPreview("image/jpeg")).toBe(true);
  await expect(readDocument("", new Blob(["Registration"], { type: "text/plain" }))).resolves.toBe("Registration");
});

const fleet = [
  { vehicle_id: "V0100001", plate_number: "D 48213", vin: "1HGCM82633A004352" },
  { vehicle_id: "V0100002", plate_number: "K 11", vin: "1M8GDM9AXKP042788" },
  { vehicle_id: "V0100003", plate_number: "34 FT 112", vin: null },
];

describe("dates", () => {
  it("reads day-first numeric, ISO and written dates", () => {
    expect(findDates("Exp 12/03/2027").map((d) => d.date)).toEqual(["2027-03-12"]);
    expect(findDates("2026-11-30").map((d) => d.date)).toEqual(["2026-11-30"]);
    expect(findDates("valid until 5 Mar 2027").map((d) => d.date)).toEqual(["2027-03-05"]);
    expect(findDates("03/25/2027").map((d) => d.date)).toEqual(["2027-03-25"]);   // only month-first is possible
    expect(findDates("31/02/2027")).toEqual([]);                                   // impossible date
  });
  it("Arabic-Indic digits", () => {
    expect(asciiDigits("١٢/٠٣/٢٠٢٧")).toBe("12/03/2027");
    expect(findDates("تاريخ الانتهاء ١٢/٠٣/٢٠٢٧").map((d) => d.date)).toEqual(["2027-03-12"]);
  });
});

describe("registration card", () => {
  it("UAE-style card: plate, dates by keyword, issuer", () => {
    const text = `UNITED ARAB EMIRATES  Vehicle License  ملكية مركبة
      Traffic Plate No: D 48213   Place of Issue: Dubai   RTA
      Reg. Date: 13/03/2026      Exp. Date: 12/03/2027     Ins. Exp: 01/02/2027
      Model: 2025  Origin: Japan   Chassis No: 1HGCM82633A004352`;
    const x = extractFields(text, fleet);
    expect(x).toMatchObject({ vehicle_id: "V0100001", matched_by: "vin", doc_type: "Registration", expiry_date: "2027-03-12", issuer: "RTA" });
    expect(x.issue_date).toBe("2026-03-13");
  });
  it("matches by plate when the VIN is not printed, and prefers the longest plate", () => {
    const x = extractFields("Ruhsat  Plaka: 34 FT 112   Muayene bitiş 01.09.2027", fleet);
    expect(x).toMatchObject({ vehicle_id: "V0100003", matched_by: "plate", expiry_date: "2027-09-01" });
  });
});

describe("insurance policy", () => {
  it("type, insurer from the fleet's own list, policy number, period", () => {
    const text = `Oasis Assurance — Motor Insurance Policy
      Policy No: POL-2219931    Period of cover: from 02/02/2026 to 01/02/2027
      Vehicle: D48213`;
    const x = extractFields(text, fleet, ["Oasis Assurance", "Gulf Insurance"]);
    expect(x).toMatchObject({ doc_type: "Insurance", issuer: "Oasis Assurance", document_number: "POL-2219931",
      vehicle_id: "V0100001", expiry_date: "2027-02-01", issue_date: "2026-02-02" });
  });
  it("unknown vehicle stays unmatched rather than guessing", () => {
    expect(extractFields("Policy for plate Z 99999 exp 01/01/2027", fleet).vehicle_id).toBeNull();
  });
});

describe("document type", () => {
  it("a vehicle licence that prints insurance details is still a registration card (OCR text from a real scan test)", () => {
    const ocr = `ED ARAB EMIRATES VEHICLE LICENSE
Traffic Plate No: M 70994 Place of Issue: Dubai RTA
Owner: AL NOOR RENT A CAR LLC
Reg. Date: 14/03/2026 Exp. Date: 13/03/2027
Ins. Exp: 02/02/2027 Policy No: POL-8812231
Model: 2023 Origin: USA Veh. Type: SALOON
Chassis No: 5YJ3E1EA0PF101850`;
    const x = extractFields(ocr, [{ vehicle_id: "ANR-051", plate_number: "M 70994", vin: "5YJ3E1EA0PF101850" }]);
    expect(x).toMatchObject({ doc_type: "Registration", vehicle_id: "ANR-051", matched_by: "vin",
      issue_date: "2026-03-14", expiry_date: "2027-03-13" });
  });
});

describe("plate as printed", () => {
  it("reads the plate after its label when no vehicle matches", () => {
    const x = extractFields("VEHICLE LICENSE\nTraffic Plate No:  M 70994     Place of Issue: Dubai  RTA\nExp. Date: 13/03/2027", []);
    expect(x.vehicle_id).toBeNull();
    expect(x.plate_in_text).toBe("M 70994");
    expect(extractFields("Ruhsat  Plaka: 34 FT 112", []).plate_in_text).toBe("34 FT 112");
  });
});

