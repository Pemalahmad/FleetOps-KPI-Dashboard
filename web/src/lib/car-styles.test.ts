import { describe, expect, it } from "vitest";
import { BODY_STYLES, carProfile, guessBodyStyle, isBodyStyle, modelKey, paintColor, profilePath } from "./car-styles";

describe("car body styles", () => {
  it("guesses the shape from common model names", () => {
    expect(guessBodyStyle("Toyota", "Land Cruiser")).toBe("suv");
    expect(guessBodyStyle("Toyota", "Hilux", "Double Cab")).toBe("pickup");
    expect(guessBodyStyle("Toyota", "Hiace")).toBe("van");
    expect(guessBodyStyle("Toyota", "Coaster")).toBe("minibus");
    expect(guessBodyStyle("Mitsubishi", "Canter")).toBe("truck");
    expect(guessBodyStyle("Toyota", "Yaris")).toBe("hatchback");
    expect(guessBodyStyle("Tesla", "Model Y")).toBe("suv");
    expect(guessBodyStyle("Tesla", "Model 3")).toBe("sedan");
    expect(guessBodyStyle("Sahra", "X2 SUV EV")).toBe("suv");
    expect(guessBodyStyle("Sahra", "V3 Van Diesel", "Crew Van")).toBe("van");
    expect(guessBodyStyle("Unknown", "Something")).toBe("sedan");
    expect(guessBodyStyle(null, null)).toBe("sedan");
  });
  it("keys a model the same way however it was typed", () => {
    expect(modelKey("TOYOTA ", "hilux")).toBe(modelKey("Toyota", "HILUX"));
    expect(modelKey(null, "Hilux")).toBe("|hilux");
  });
  it("accepts only listed styles", () => {
    expect(isBodyStyle("suv")).toBe(true);
    expect(isBodyStyle("tank")).toBe(false);
    expect(isBodyStyle(undefined)).toBe(false);
  });
  it("maps register colours to paint, with a neutral default", () => {
    expect(paintColor("Pearl White")).toBe("#ece8df");
    expect(paintColor("WHITE")).toBe("#eef0f3");
    expect(paintColor("Dark Blue")).toBe("#1f3157");
    expect(paintColor("")).toBe("#a9aeb8");
    expect(paintColor(null)).toBe("#a9aeb8");
  });
  it("builds a closed, finite profile for every style with wheels inside the body", () => {
    for (const { id } of BODY_STYLES) {
      const p = carProfile(id);
      expect(p.outline.length).toBeGreaterThan(20);
      for (const [z, y] of [...p.outline, ...p.glass]) {
        expect(Number.isFinite(z) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(z)).toBeLessThanOrEqual(p.length / 2 + 0.05);
        expect(y).toBeGreaterThanOrEqual(0);
      }
      for (const w of p.wheels) expect(Math.abs(w)).toBeLessThan(p.length / 2);
      expect(profilePath(id).d).toMatch(/^M[\d.,L]+Z$/);
    }
  });
});
