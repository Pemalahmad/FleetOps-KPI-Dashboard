/**
 * A lofted car body: cross-sections along the car's length, each a rounded body section with a narrower glass house on
 * top, so the result has curved sides, a tapered nose and tail in plan view, tumblehome and real wheel arches. Pure
 * maths: positions plus two index lists (paint and glass) that the 3D garage turns into a mesh.
 */
import { carProfile, type BodyStyle } from "./car-styles";

export interface CarMesh {
  positions: Float32Array; paint: number[]; glass: number[];
  length: number; width: number; height: number; belt: number;
  wheels: { z: number; x: number }[]; wheelR: number;
  /** Half the body width at a station along the length. */
  halfAt: (z: number) => number;
  /** Where the windscreen meets the bonnet. */
  cowlZ: number;
  /** Heights of the nose and tail faces at the ends, for lamps and grille. */
  noseY: number; tailY: number;
  bed?: [number, number, number, number]; cargo?: [number, number, number, number];
  fifth?: [number, number]; style: BodyStyle;
}

const STATIONS = 56;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function carMesh(style: BodyStyle): CarMesh {
  const p = carProfile(style), h = p.length / 2, half = p.width / 2;
  // read the key heights back from the side profile
  const pts = p.outline;
  const top = (z: number) => {
    // highest point of the silhouette at this station (linear between outline vertices)
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const [z1, y1] = pts[i], [z2, y2] = pts[(i + 1) % pts.length];
      if ((z - z1) * (z - z2) <= 0 && z1 !== z2) best = Math.max(best, y1 + ((y2 - y1) * (z - z1)) / (z2 - z1));
    }
    return best;
  };
  const belt = p.belt, clear = Math.min(...pts.map((q) => q[1]).filter((y) => y > 0.05));
  const archR = p.wheelR + 0.07;
  const cabin = (z: number) => top(z) - belt > 0.12;

  const ring = (z: number) => {
    const u = Math.abs(z) / h;
    // plan view: square-ish superellipse, so the nose and tail round off but the doors stay straight
    const w = half * Math.pow(Math.max(0, 1 - Math.pow(u, 7)), 1 / 7);
    const roof = top(z), b = Math.min(roof, cabin(z) ? belt : roof);
    // underside follows the wheel arches
    let floor = clear;
    for (const wz of p.wheels) {
      const d = Math.abs(z - wz);
      if (d < archR) floor = Math.max(floor, p.wheelR + Math.sqrt(archR * archR - d * d) * 0.92);
    }
    floor = Math.min(floor, b - 0.08);
    const g = cabin(z) ? roof : b; // glass-house top
    const wr = w * (style === "van" || style === "minibus" || style === "truck" || style === "tractor" ? 0.92 : 0.76);
    const crown = Math.min(0.05, (g - b) * 0.15 + 0.02);
    const sideH = b - floor;
    // right half, bottom centre → top centre; [x, y, isGlassBand]
    const half_: [number, number, boolean][] = [
      [0, floor, false], [w * 0.82, floor, false], [w * 0.96, floor + Math.min(0.07, sideH * 0.2), false],
      [w, floor + sideH * 0.38, false], [w * 0.985, floor + sideH * 0.78, false], [w * 0.94, b, false],
      [w * 0.9, b + 0.015, true],
      [w * 0.9 - (w * 0.9 - wr) * 0.5, p.glassTop && g > p.glassTop ? p.glassTop : b + (g - b) * 0.55, true],
      [wr, g - 0.05, false], [wr * 0.55, g - 0.005, false], [0, g + crown * 0.4, false],
    ];
    return { half: half_, w };
  };

  const zs = Array.from({ length: STATIONS }, (_, i) => -h + (2 * h * smooth(i / (STATIONS - 1)) * 0.5 + (2 * h * i) / (STATIONS - 1) * 0.5));
  const rings = zs.map((z) => ({ z, ...ring(z) }));
  const per = rings[0].half.length * 2 - 1; // mirrored, centre points shared
  const positions = new Float32Array(rings.length * per * 3);
  rings.forEach((r, i) => {
    const full: [number, number][] = [
      ...r.half.slice().reverse().map(([x, y]) => [-x, y] as [number, number]),
      ...r.half.slice(1).map(([x, y]) => [x, y] as [number, number]),
    ];
    full.forEach(([x, y], j) => positions.set([x, y, r.z], (i * per + j) * 3));
  });
  // which ring bands are side glass (mirrored indices)
  const nHalf = rings[0].half.length;
  const bandGlass = (j: number) => {
    // band between point j and j+1 in the full ring; map to the half index
    const a = j < nHalf - 1 ? nHalf - 1 - j : j - (nHalf - 1);
    const b = j < nHalf - 1 ? a - 1 : a + 1;
    const k = Math.min(a, b);
    return k === 6 || (k === 7 && !p.glassTop);
  };
  const roofBand = (j: number) => {
    const a = j < nHalf - 1 ? nHalf - 1 - j : j - (nHalf - 1), b = j < nHalf - 1 ? a - 1 : a + 1;
    return Math.min(a, b) >= 8;
  };
  const paint: number[] = [], glass: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const z0 = rings[i].z, z1 = rings[i + 1].z;
    const inCabin = cabin(z0) && cabin(z1);
    // windscreen / rear window: the roof bands where the glass-house top is sloping
    const slope = Math.abs(top(z1) - top(z0)) / Math.max(1e-6, z1 - z0);
    const screen = (cabin(z0) || cabin(z1)) && slope > 0.18;
    for (let j = 0; j < per - 1; j++) {
      const a = i * per + j, b = a + 1, c = a + per, d = c + 1;
      const isGlass = (bandGlass(j) && (inCabin || screen)) || (roofBand(j) && screen && clamp01(slope) > 0);
      const list = isGlass ? glass : paint;
      list.push(a, b, c, b, d, c);
    }
  }
  const wheelX = (z: number) => ring(z).w - 0.12;
  return {
    positions, paint, glass, length: p.length, width: p.width, height: p.height, belt,
    wheels: p.wheels.flatMap((z) => [{ z, x: wheelX(z) }, { z, x: -wheelX(z) }]), wheelR: p.wheelR,
    halfAt: (z: number) => ring(z).w, cowlZ: p.glass[3][0],
    noseY: top(h - 0.02), tailY: top(-h + 0.02), bed: p.bed, cargo: p.cargo, fifth: p.fifth, style,
  };
}
