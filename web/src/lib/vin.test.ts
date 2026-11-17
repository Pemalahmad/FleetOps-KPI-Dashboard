import { describe, expect, it } from "vitest";
import { checkDigit, findVins, specFromVpic, vinModelYear, vinStatus } from "./vin";

describe("VIN rules (same as the SQL macros)", () => {
  it("check digit, including X", () => {
    expect(checkDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(checkDigit("1HGCM82633A004352")).toBe("3");
  });
  it("status", () => {
    expect(vinStatus("1M8GDM9AXKP042788")).toBe("Valid");
    expect(vinStatus("1m8-gdm9axkp042788")).toBe("Valid");            // cleaned
    expect(vinStatus("1M8GDM9A1KP042788")).toBe("Check digit mismatch");
    expect(vinStatus("LRW3E7EK0PC123456")).toBe("Valid");              // check digit not mandatory outside North America
    expect(vinStatus("WVWZZZ1KZ6W61234O")).toBe("Invalid format");
    expect(vinStatus("")).toBe("Missing");
  });
  it("model year on the 30-year cycle", () => {
    const asOf = new Date("2026-11-17");
    expect(vinModelYear("1M8GDM9AXKP042788", asOf)).toBe(2019);
    expect(vinModelYear("1HGCM82633A004352", asOf)).toBe(2003);
    expect(vinModelYear("LRW3E7EK0PC123456", asOf)).toBe(2023);
  });
  it("finds VINs in OCR text and repairs O/I misreads", () => {
    const text = "VEHICLE REGISTRATION\nChassis No: 1HGCM8263 3AO04352  Exp 12/03/2027";
    expect(findVins(text)).toContain("1HGCM82633A004352");
  });
});

describe("vPIC decode mapping", () => {
  it("turns a result into register fields", () => {
    const s = specFromVpic({
      VIN: "5YJ3E1EA7KF317000", Make: "TESLA", Model: "Model 3", ModelYear: "2019", Trim: "Long Range",
      ElectrificationLevel: "BEV (Battery Electric Vehicle)", FuelTypePrimary: "Electric", BatteryKWh: "75",
      DriveType: "AWD/All-Wheel Drive", BodyClass: "Sedan/Saloon", Seats: "5", ErrorCode: "0",
    });
    expect(s).toMatchObject({ make: "TESLA", model: "Model 3", model_year: 2019, trim: "Long Range", powertrain: "BEV" });
    expect(s.configuration).toBe("75 kWh · AWD · Sedan/Saloon · 5 seats");
    const ice = specFromVpic({ VIN: "x", FuelTypePrimary: "Gasoline", DisplacementL: "1.8", ErrorCode: "0" });
    expect(ice.powertrain).toBe("ICE");
    expect(ice.fuel_type).toBe("petrol");
  });
});
