/**
 * Car body styles for the 3D garage: the list the owner picks from, a best guess from the model name, the paint colour
 * from the register's colour text, and one side profile per style that both the 3D car and the 2D preview are drawn
 * from. Pure data and maths; no DOM, no three.js.
 */
import { cleanName } from "./names";

export type BodyStyle = "sedan" | "hatchback" | "suv" | "pickup" | "van" | "minibus" | "truck";

export const BODY_STYLES: { id: BodyStyle; label: string; examples: string }[] = [
  { id: "sedan", label: "Sedan", examples: "Camry, Corolla, Model 3, Accent" },
  { id: "hatchback", label: "Hatchback", examples: "Yaris, Golf, i20, Polo" },
  { id: "suv", label: "SUV", examples: "Land Cruiser, RAV4, Patrol, Model Y" },
  { id: "pickup", label: "Pickup", examples: "Hilux, Ranger, Navara, F-150" },
  { id: "van", label: "Van", examples: "Hiace, Transit, Sprinter, H-1" },
  { id: "minibus", label: "Minibus", examples: "Coaster, Rosa, Civilian" },
  { id: "truck", label: "Box truck", examples: "Canter, NPR, Dyna, Actros" },
];
export const isBodyStyle = (v: unknown): v is BodyStyle => BODY_STYLES.some((s) => s.id === v);

/** Stable key for a make and model, so "TOYOTA  Hilux" and "Toyota hilux" share one choice. */
export function modelKey(make: string | null | undefined, model: string | null | undefined) {
  return [make, model].map((x) => (cleanName(x) ?? "").toLowerCase()).join("|");
}

const RULES: [RegExp, BodyStyle][] = [
  [/\b(box ?truck|truck|lorry|canter|npr|nqr|elf|dyna|actros|atego|forward|fuso|tipper|chassis cab)\b/, "truck"],
  [/\b(minibus|mini bus|bus|coaster|rosa|civilian|county|school)\b/, "minibus"],
  [/\b(pick ?up|pickup|hilux|ranger|navara|d-?max|l200|triton|tacoma|tundra|f-?150|silverado|ram 1500|gladiator|amarok|bt-?50|double cab|single cab|cybertruck)\b/, "pickup"],
  [/\b(van|hiace|transit|sprinter|crafter|h-?1|staria|urvan|vito|trafic|ducato|boxer|panel|crew van|starex|carnival|odyssey|sienna)\b/, "van"],
  [/\b(suv|crossover|cuv|land ?cruiser|prado|patrol|rav ?4|cr-?v|tucson|santa ?fe|sportage|sorento|x-?trail|fortuner|pajero|tahoe|yukon|suburban|explorer|expedition|model [xy]|q[3578]|x[1-7]|gl[abce]|ev[569]|id\.?4|kona|creta|seltos|range rover|defender|wrangler|4x4|7 seats)\b/, "suv"],
  [/\b(hatch|hatchback|yaris|golf|polo|i10|i20|i30|fiesta|clio|swift|micra|jazz|fit|picanto|rio hatch|208|mini|leaf|zoe|id\.?3)\b/, "hatchback"],
  [/\b(sedan|saloon|camry|corolla|accent|elantra|sonata|altima|sunny|civic|accord|model [3s]|cerato|k5|passat|jetta|a[3468]|[35] series|c-?class|e-?class|taxi)\b/, "sedan"],
];

/** Best guess from the make, model, trim and configuration text; sedan when nothing matches. */
export function guessBodyStyle(...text: (string | null | undefined)[]): BodyStyle {
  const t = text.filter(Boolean).join(" ").toLowerCase();
  for (const [re, style] of RULES) if (re.test(t)) return style;
  return "sedan";
}

const PAINT: [RegExp, string][] = [
  [/pearl|ivory|cream/, "#ece8df"], [/white|blanc/, "#eef0f3"], [/black|noir|onyx|obsidian/, "#17191f"],
  [/silver|aluminium|aluminum/, "#b9bdc5"], [/grey|gray|graphite|titanium|gunmetal|charcoal/, "#6c717b"],
  [/navy|dark blue/, "#1f3157"], [/blue|azure|cobalt|teal/, "#2d5597"], [/maroon|burgundy|wine/, "#6e1f2a"],
  [/red|crimson|ruby/, "#b3262e"], [/green|olive|khaki/, "#3b6b4c"], [/yellow/, "#e2b22c"], [/orange/, "#d9682b"],
  [/gold|champagne/, "#b9975b"], [/beige|sand|tan/, "#cbb994"], [/brown|bronze/, "#6b4a32"],
];
/** Paint colour from the register's colour text; a neutral silver when it is blank or unknown. */
export function paintColor(color: string | null | undefined): string {
  const t = (color ?? "").toLowerCase();
  for (const [re, hex] of PAINT) if (re.test(t)) return hex;
  return "#a9aeb8";
}

export interface CarProfile {
  /** Side silhouette, metres: z along the car (rear at −length/2, front at +length/2), y up from the road. */
  outline: [number, number][];
  /** Side windows and screens, drawn as glass over the body. */
  glass: [number, number][];
  wheels: number[]; wheelR: number; length: number; width: number; height: number; belt: number;
  /** Extra parts: an open pickup bed or a cargo box, as [rearZ, frontZ, bottomY, topY]. */
  bed?: [number, number, number, number]; cargo?: [number, number, number, number];
}

interface Spec { L: number; W: number; H: number; belt: number; clear: number; hood: number; deck: number; fr: number; rr: number;
  nose: number; tail: number; R: number; wf: number; wr: number }

const SPECS: Record<BodyStyle, Spec> = {
  sedan: { L: 4.75, W: 1.84, H: 1.45, belt: 0.98, clear: 0.2, hood: 1.22, deck: 0.92, fr: 0.78, rr: 0.62, nose: 0.78, tail: 0.92, R: 0.34, wf: 0.95, wr: 1.0 },
  hatchback: { L: 4.1, W: 1.76, H: 1.48, belt: 0.98, clear: 0.19, hood: 0.98, deck: 0.12, fr: 0.72, rr: 0.32, nose: 0.76, tail: 0.98, R: 0.32, wf: 0.82, wr: 0.68 },
  suv: { L: 4.85, W: 1.94, H: 1.82, belt: 1.18, clear: 0.3, hood: 1.15, deck: 0.18, fr: 0.62, rr: 0.24, nose: 1.02, tail: 1.18, R: 0.4, wf: 0.95, wr: 0.95 },
  pickup: { L: 5.35, W: 1.9, H: 1.84, belt: 1.15, clear: 0.32, hood: 1.18, deck: 1.62, fr: 0.58, rr: 0.06, nose: 1.02, tail: 1.12, R: 0.4, wf: 0.95, wr: 0.98 },
  van: { L: 5.3, W: 2.0, H: 2.32, belt: 1.18, clear: 0.24, hood: 0.52, deck: 0, fr: 0.82, rr: 0.05, nose: 0.98, tail: 1.18, R: 0.36, wf: 0.82, wr: 1.05 },
  minibus: { L: 6.6, W: 2.05, H: 2.62, belt: 1.3, clear: 0.26, hood: 0.5, deck: 0, fr: 0.5, rr: 0.04, nose: 1.06, tail: 1.3, R: 0.4, wf: 0.95, wr: 1.55 },
  truck: { L: 6.6, W: 2.1, H: 2.45, belt: 1.45, clear: 0.42, hood: 0.32, deck: 4.2, fr: 0.28, rr: 0.04, nose: 1.15, tail: 0.9, R: 0.45, wf: 1.0, wr: 1.25 },
};

function arch(z: number, R: number, clear: number): [number, number][] {
  const a = R + 0.07, yc = R, t0 = Math.asin(Math.max(-1, Math.min(1, (clear - yc) / a))), pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = t0 + ((Math.PI - 2 * t0) * i) / 12;
    pts.push([z + a * Math.cos(t), yc + a * Math.sin(t)]);
  }
  return pts;
}
const lerp = (a: [number, number], b: [number, number], y: number): [number, number] => {
  const k = (y - a[1]) / (b[1] - a[1] || 1);
  return [a[0] + (b[0] - a[0]) * k, y];
};

export function carProfile(style: BodyStyle): CarProfile {
  const s = SPECS[style], h = s.L / 2;
  const fz = h - s.wf, rz = -h + s.wr;
  const deckEnd: [number, number] = [-h + s.deck, style === "truck" ? s.tail : s.belt];
  const roofRear: [number, number] = [-h + s.deck + s.rr, s.H], roofFront: [number, number] = [h - s.hood - s.fr, s.H];
  const screen: [number, number] = [h - s.hood, s.belt];
  const outline: [number, number][] = [
    [-h, s.clear + 0.06], [-h, s.tail], [-h + 0.06, s.tail + 0.02], deckEnd,
    ...(style === "truck" ? [[-h + s.deck, s.tail] as [number, number], [-h + s.deck + 0.02, s.H - 0.25] as [number, number]] : []),
    roofRear, roofFront, screen, [h - 0.08, s.nose], [h, s.nose - 0.08], [h, s.clear + 0.1],
    ...arch(fz, s.R, s.clear), ...arch(rz, s.R, s.clear),
  ];
  const lo = s.belt + 0.06, hi = s.H - 0.08;
  const rearA = style === "truck" ? [-h + s.deck + 0.02, s.H - 0.25] as [number, number] : deckEnd;
  const glass: [number, number][] = [
    lerp(rearA, roofRear, lo), lerp(rearA, roofRear, hi), lerp(screen, roofFront, hi), lerp(screen, roofFront, lo),
  ];
  return {
    outline, glass, wheels: [fz, rz], wheelR: s.R, length: s.L, width: s.W, height: s.H, belt: s.belt,
    bed: style === "pickup" ? [-h + 0.08, -h + s.deck - 0.04, s.belt - 0.35, s.belt] : undefined,
    cargo: style === "truck" ? [-h, -h + s.deck - 0.05, s.tail - 0.02, 3.2] : undefined,
  };
}

/** The side view as an SVG path (y flipped), for the style picker's preview. */
export function profilePath(style: BodyStyle, scale = 10): { d: string; glass: string; wheels: { cx: number; r: number }[]; w: number; h: number; cargo: string | null } {
  const p = carProfile(style), top = p.cargo ? p.cargo[3] : p.height;
  const X = (z: number) => (z + p.length / 2) * scale, Y = (y: number) => (top - y) * scale;
  const path = (pts: [number, number][]) => "M" + pts.map(([z, y]) => `${X(z).toFixed(1)},${Y(y).toFixed(1)}`).join("L") + "Z";
  const c = p.cargo;
  return {
    d: path(p.outline), glass: path(p.glass), w: p.length * scale, h: top * scale,
    wheels: p.wheels.map((z) => ({ cx: X(z), r: p.wheelR * scale })),
    cargo: c ? path([[c[0], c[2]], [c[0], c[3]], [c[1], c[3]], [c[1], c[2]]]) : null,
  };
}
