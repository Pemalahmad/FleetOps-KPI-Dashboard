import { describe, expect, it } from "vitest";
import { carMesh } from "./car-mesh";
import { BODY_STYLES } from "./car-styles";

describe("lofted car bodies", () => {
  it("are finite, indexed in range and have glass for every style", () => {
    for (const { id } of BODY_STYLES) {
      const m = carMesh(id), n = m.positions.length / 3;
      expect(m.positions.every(Number.isFinite)).toBe(true);
      for (const i of [...m.paint, ...m.glass]) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(n); }
      expect(m.paint.length % 3).toBe(0);
      expect(m.glass.length).toBeGreaterThan(0);
      expect(m.wheels).toHaveLength(4);
    }
  });
  it("stay within the car's footprint and taper at the nose and tail", () => {
    const m = carMesh("sedan");
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.abs(m.positions[i])).toBeLessThanOrEqual(m.width / 2 + 1e-6);
      expect(Math.abs(m.positions[i + 2])).toBeLessThanOrEqual(m.length / 2 + 1e-6);
      expect(m.positions[i + 1]).toBeGreaterThanOrEqual(0);
    }
    expect(m.halfAt(0)).toBeCloseTo(m.width / 2, 2);
    expect(m.halfAt(m.length / 2 - 0.05)).toBeLessThan(m.halfAt(0) * 0.8);
  });
});
