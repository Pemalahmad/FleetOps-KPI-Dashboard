import { describe, expect, it } from "vitest";
import { cleanName, withoutPrefix } from "./names";

describe("vehicle names", () => {
  it("keeps mixed-case names and tidies spacing", () => {
    expect(cleanName("  Model 3   Long Range ")).toBe("Model 3 Long Range");
    expect(cleanName("S1 Sedan EV")).toBe("S1 Sedan EV");
  });
  it("title-cases names that arrived in one case, keeping drivetrain codes upper case", () => {
    expect(cleanName("TOYOTA")).toBe("Toyota");
    expect(cleanName("land cruiser gxr awd")).toBe("Land Cruiser Gxr AWD");
    expect(cleanName("X2 SUV PHEV")).toBe("X2 SUV PHEV");
  });
  it("treats blanks as missing", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
  it("drops a repeated parent name", () => {
    expect(withoutPrefix("Toyota Camry", "Toyota")).toBe("Camry");
    expect(withoutPrefix("Camry", "Toyota")).toBe("Camry");
    expect(withoutPrefix("Toyota", "Toyota")).toBe("Toyota");
    expect(withoutPrefix("A.B (x) rest", "A.B (x)")).toBe("rest");
  });
});
