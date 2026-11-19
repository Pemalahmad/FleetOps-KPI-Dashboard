"use client";

import type { ReactNode } from "react";
import { profilePath, type BodyStyle } from "@/lib/car-styles";

/**
 * Page illustrations: small vector scenes drawn in code (no image files, no outside hosts), coloured from the theme tokens so
 * they follow light and dark mode. Motion is CSS only (wheels, road, bars, clock hands, floating badges) and stops for reduced motion.
 */
export type ArtKind =
  | "garage" | "analytics" | "network" | "drivers" | "workshop" | "customer" | "ledger" | "documents"
  | "fleet" | "import" | "pipeline" | "plan" | "licence" | "doctrine" | "legal" | "system";

const A = "var(--accent)", SOFT = "var(--accent-soft)", PANEL = "var(--panel)", P2 = "var(--panel-2)", LINE = "var(--border)",
  MUTED = "var(--muted)", FAINT = "var(--faint)", GOOD = "var(--good)";

/** A side-view vehicle from the same profile as the 3D garage, `width` px wide, standing on y. */
function Car({ x, y, width, style = "sedan", paint = A, spin = true }: { x: number; y: number; width: number; style?: BodyStyle; paint?: string; spin?: boolean }) {
  const p = profilePath(style, 10), s = width / p.w;
  return (
    <g transform={`translate(${x} ${y - p.h * s}) scale(${s})`}>
      {p.cargo && <path d={p.cargo} fill={P2} stroke={MUTED} strokeWidth={1.2 / s} />}
      <path d={p.d} fill={paint} stroke="var(--text)" strokeOpacity={0.25} strokeWidth={1 / s} strokeLinejoin="round" />
      <path d={p.glass} fill="#1d2a40" opacity={0.85} />
      {p.wheels.map((w) => (
        <g key={w.cx} className={spin ? "art-spin" : undefined}>
          <circle cx={w.cx} cy={p.h - w.r} r={w.r} fill="#16181f" />
          <circle cx={w.cx} cy={p.h - w.r} r={w.r * 0.55} fill="#c3c7cf" />
          <path d={`M${w.cx - w.r * 0.5},${p.h - w.r}H${w.cx + w.r * 0.5}M${w.cx},${p.h - w.r * 1.5}V${p.h - w.r * 0.5}`} stroke="#7b8190" strokeWidth={w.r * 0.14} />
        </g>
      ))}
    </g>
  );
}

/** A floating emoji badge. */
function Chip({ x, y, e, d = 0 }: { x: number; y: number; e: string; d?: number }) {
  return (
    <g className="art-float" style={{ animationDelay: `${d}s` }}>
      <rect x={x - 17} y={y - 17} width={34} height={34} rx={10} fill={PANEL} stroke={LINE} />
      <text x={x} y={y + 6.5} textAnchor="middle" fontSize={18}>{e}</text>
    </g>
  );
}

const Road = ({ y, x1 = 0, x2 = 320 }: { y: number; x1?: number; x2?: number }) => (
  <g>
    <rect x={x1} y={y} width={x2 - x1} height={22} rx={4} fill={P2} />
    <line x1={x1 + 6} y1={y + 11} x2={x2 - 6} y2={y + 11} stroke={FAINT} strokeWidth={2} strokeDasharray="12 10" className="art-road" />
  </g>
);

function Bars({ x, y, values, w = 12, gap = 7, h = 60, color = A }: { x: number; y: number; values: number[]; w?: number; gap?: number; h?: number; color?: string }) {
  return <g>{values.map((v, i) => <rect key={i} className="art-grow" style={{ animationDelay: `${i * 0.08}s` }} x={x + i * (w + gap)} y={y - v * h} width={w} height={v * h} rx={3} fill={i === values.length - 1 ? color : SOFT} stroke={i === values.length - 1 ? "none" : color} strokeOpacity={0.35} />)}</g>;
}

const Card = ({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) => (
  <g><rect x={x} y={y} width={w} height={h} rx={10} fill={PANEL} stroke={LINE} />{children}</g>
);
const Lines = ({ x, y, n, w, gap = 9 }: { x: number; y: number; n: number; w: number; gap?: number }) => (
  <g>{Array.from({ length: n }, (_, i) => <rect key={i} x={x} y={y + i * gap} width={i === n - 1 ? w * 0.6 : w} height={4} rx={2} fill={LINE} />)}</g>
);

function Clock({ cx, cy, r, speed = 6 }: { cx: number; cy: number; r: number; speed?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={PANEL} stroke={A} strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return <line key={i} x1={cx + Math.sin(a) * r * 0.78} y1={cy - Math.cos(a) * r * 0.78} x2={cx + Math.sin(a) * r * 0.9} y2={cy - Math.cos(a) * r * 0.9} stroke={FAINT} strokeWidth={i % 3 ? 1.2 : 2.4} />; })}
      <line x1={cx} y1={cy} x2={cx} y2={cy - r * 0.5} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
      <line className="art-tick" style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: `${speed}s` }} x1={cx} y1={cy} x2={cx + r * 0.7} y2={cy} stroke={A} strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill={A} />
    </g>
  );
}

const Blob = () => (
  <g aria-hidden="true">
    <ellipse cx={170} cy={104} rx={150} ry={86} fill={SOFT} opacity={0.75} />
    {[[28, 30], [298, 40], [40, 170], [290, 168], [160, 14]].map(([x, y], i) => <circle key={i} className="art-twinkle" style={{ animationDelay: `${i * 0.5}s` }} cx={x} cy={y} r={2.2} fill={A} />)}
  </g>
);

const SCENES: Record<ArtKind, () => ReactNode> = {
  garage: () => (<>
    <path d="M70 92 L160 46 L250 92 V160 H70Z" fill={PANEL} stroke={LINE} strokeWidth={2} />
    <path d="M62 96 L160 42 L258 96" fill="none" stroke={A} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    <rect x={108} y={98} width={104} height={62} rx={4} fill={P2} stroke={LINE} />
    {[0, 1, 2, 3].map((i) => <line key={i} x1={110} x2={210} y1={106 + i * 9} y2={106 + i * 9} stroke={LINE} strokeWidth={2} />)}
    <Road y={160} />
    <g className="art-drive"><Car x={120} y={168} width={86} style="suv" /></g>
    <Chip x={268} y={62} e="🔧" /><Chip x={52} y={58} e="🏁" d={0.8} />
  </>),
  analytics: () => (<>
    <Card x={44} y={34} w={236} h={130}>
      <Bars x={62} y={146} values={[0.35, 0.55, 0.45, 0.7, 0.6, 0.85]} h={78} />
      <path className="art-draw" d="M178 120 C196 104 206 112 220 92 S248 74 262 60" fill="none" stroke={A} strokeWidth={3} strokeLinecap="round" pathLength={1} />
      <circle cx={262} cy={60} r={5} fill={A} className="art-pulse" />
      <circle cx={232} cy={140} r={13} fill="none" stroke={SOFT} strokeWidth={6} />
      <circle cx={232} cy={140} r={13} fill="none" stroke={GOOD} strokeWidth={6} strokeDasharray="56 82" transform="rotate(-90 232 140)" />
    </Card>
    <Chip x={286} y={34} e="📊" /><Chip x={38} y={150} e="🚗" d={0.6} /><Chip x={160} y={182} e="⚡" d={1.2} />
  </>),
  network: () => {
    const N: [number, number, string][] = [[160, 98, "⭐"], [70, 52, "🔧"], [252, 50, "⏱️"], [62, 152, "🧾"], [258, 150, "💰"], [160, 176, "🚗"]];
    return (<>
      {N.slice(1).map(([x, y], i) => <line key={i} x1={160} y1={98} x2={x} y2={y} stroke={A} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 6" className="art-road" />)}
      <line x1={70} y1={52} x2={252} y2={50} stroke={LINE} strokeWidth={2} /><line x1={62} y1={152} x2={160} y2={176} stroke={LINE} strokeWidth={2} />
      {N.map(([x, y, e], i) => (
        <g key={i} className={i ? "art-float" : "art-pulse-soft"} style={{ animationDelay: `${i * 0.3}s` }}>
          <circle cx={x} cy={y} r={i ? 19 : 27} fill={i ? PANEL : A} stroke={i ? LINE : "none"} strokeWidth={2} />
          <text x={x} y={y + (i ? 6 : 8)} textAnchor="middle" fontSize={i ? 17 : 23}>{e}</text>
        </g>
      ))}
    </>);
  },
  drivers: () => (<>
    <Road y={150} />
    <g className="art-drive"><Car x={30} y={158} width={70} style="hatchback" paint="#94a3b8" /></g>
    <g className="art-float">
      <circle cx={170} cy={86} r={52} fill={PANEL} stroke={A} strokeWidth={9} />
      <circle cx={170} cy={86} r={13} fill={A} />
      <path d="M118 86 H157 M183 86 H222 M170 99 V138" stroke={A} strokeWidth={8} strokeLinecap="round" />
    </g>
    <Chip x={262} y={46} e="🪪" /><Chip x={276} y={110} e="🛡️" d={0.7} /><Chip x={64} y={60} e="🧑‍✈️" d={1.3} />
  </>),
  workshop: () => (<>
    <rect x={70} y={140} width={180} height={8} rx={3} fill={MUTED} />
    <rect x={96} y={148} width={8} height={26} fill={FAINT} /><rect x={216} y={148} width={8} height={26} fill={FAINT} />
    <rect x={60} y={174} width={200} height={6} rx={3} fill={LINE} />
    <g className="art-lift"><Car x={100} y={138} width={120} style="sedan" spin={false} /></g>
    <g className="art-gear" style={{ transformOrigin: "264px 58px" }}>
      <circle cx={264} cy={58} r={20} fill="none" stroke={A} strokeWidth={8} strokeDasharray="7 5.6" />
      <circle cx={264} cy={58} r={9} fill={PANEL} stroke={A} strokeWidth={3} />
    </g>
    <Chip x={56} y={60} e="🔧" /><Chip x={160} y={36} e="⏱️" d={0.9} />
  </>),
  customer: () => (<>
    <Clock cx={150} cy={100} r={56} />
    <g className="art-float" style={{ animationDelay: ".4s" }}>
      <path d="M222 40 h70 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-46 l-14 12 v-12 h-10 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10z" fill={PANEL} stroke={LINE} />
      <text x={257} y={73} textAnchor="middle" fontSize={20}>😊 ⭐</text>
    </g>
    <Chip x={52} y={64} e="🔑" /><Chip x={64} y={150} e="🚗" d={1} /><Chip x={262} y={150} e="✅" d={0.5} />
  </>),
  ledger: () => (<>
    <Card x={120} y={30} w={110} h={140}><text x={140} y={58} fontSize={13} fontWeight={700} fill="var(--text)">Invoice</text><Lines x={140} y={72} n={6} w={70} gap={12} /></Card>
    {[0, 1, 2, 3].map((i) => <ellipse key={i} cx={84} cy={160 - i * 11} rx={30} ry={9} fill={i === 3 ? "#f5c451" : "#e3a92f"} stroke="#b7811b" />)}
    <text x={84} y={127} textAnchor="middle" fontSize={11} fontWeight={700} fill="#7a5410">$</text>
    <Bars x={244} y={164} values={[0.4, 0.7, 0.55]} w={14} h={80} color={GOOD} />
    <Chip x={52} y={52} e="💰" /><Chip x={280} y={40} e="📈" d={0.8} />
  </>),
  documents: () => (<>
    <g transform="rotate(-6 150 100)"><Card x={74} y={52} w={170} h={104}>
      <rect x={88} y={70} width={44} height={54} rx={6} fill={SOFT} /><circle cx={110} cy={90} r={10} fill={A} opacity={0.6} /><path d="M94 122 q16 -22 32 0" fill={A} opacity={0.6} />
      <Lines x={144} y={74} n={4} w={84} gap={11} />
      <rect x={88} y={134} width={140} height={8} rx={4} fill={P2} />
    </Card></g>
    <g className="art-stamp"><circle cx={238} cy={140} r={24} fill="none" stroke={GOOD} strokeWidth={4} /><path d="M227 140 l8 8 l15 -16" fill="none" stroke={GOOD} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /></g>
    <Chip x={56} y={46} e="🪪" /><Chip x={280} y={52} e="📄" d={0.6} /><Chip x={60} y={160} e="📅" d={1.2} />
  </>),
  fleet: () => (<>
    <Road y={150} />
    <g className="art-float"><Car x={18} y={150} width={84} style="sedan" spin={false} /></g>
    <g className="art-float" style={{ animationDelay: ".4s" }}><Car x={112} y={150} width={92} style="van" paint="#94a3b8" spin={false} /></g>
    <g className="art-float" style={{ animationDelay: ".8s" }}><Car x={214} y={150} width={92} style="truck" paint="#c7d2fe" spin={false} /></g>
    <Chip x={60} y={50} e="📋" /><Chip x={262} y={46} e="🚚" d={0.7} /><Chip x={160} y={34} e="🔋" d={1.3} />
  </>),
  import: () => (<>
    <Card x={34} y={50} w={96} h={100}>
      {[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={44 + c * 27} y={62 + r * 16} width={22} height={10} rx={2} fill={r === 0 ? A : LINE} opacity={r === 0 ? 0.7 : 1} />))}
    </Card>
    <path d="M140 100 H196" stroke={A} strokeWidth={4} strokeDasharray="8 7" className="art-road" /><path d="M192 90 l12 10 l-12 10" fill="none" stroke={A} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    <g className="art-float">
      <ellipse cx={250} cy={66} rx={38} ry={12} fill={SOFT} stroke={A} strokeWidth={2.5} />
      <path d="M212 66 V134 a38 12 0 0 0 76 0 V66" fill={PANEL} stroke={A} strokeWidth={2.5} />
      <path d="M212 89 a38 12 0 0 0 76 0 M212 112 a38 12 0 0 0 76 0" fill="none" stroke={A} strokeWidth={2} opacity={0.5} />
    </g>
    <Chip x={82} y={36} e="📊" /><Chip x={168} y={152} e="✨" d={0.8} /><Chip x={296} y={150} e="🔒" d={1.4} />
  </>),
  pipeline: () => {
    const nodes: [number, number][] = [[46, 100], [130, 60], [130, 140], [214, 100], [286, 100]];
    return (<>
      {[[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]].map(([a, b], i) => <path key={i} d={`M${nodes[a][0]} ${nodes[a][1]} C${(nodes[a][0] + nodes[b][0]) / 2} ${nodes[a][1]} ${(nodes[a][0] + nodes[b][0]) / 2} ${nodes[b][1]} ${nodes[b][0]} ${nodes[b][1]}`} fill="none" stroke={A} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="6 6" className="art-road" />)}
      {nodes.map(([x, y], i) => <g key={i} className="art-float" style={{ animationDelay: `${i * 0.25}s` }}><rect x={x - 22} y={y - 16} width={44} height={32} rx={9} fill={i === 4 ? A : PANEL} stroke={i === 4 ? "none" : LINE} /><text x={x} y={y + 6} textAnchor="middle" fontSize={16}>{["📥", "🧹", "🔗", "🧪", "📊"][i]}</text></g>)}
    </>);
  },
  plan: () => (<>
    <Card x={70} y={36} w={150} h={130}>
      <rect x={70} y={36} width={150} height={28} rx={10} fill={A} /><rect x={70} y={54} width={150} height={10} fill={A} />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={84 + (i % 4) * 32} y={76 + Math.floor(i / 4) * 28} width={24} height={20} rx={4} fill={[2, 5, 7, 10].includes(i) ? SOFT : P2} />)}
      {[2, 5, 10].map((i) => <path key={i} className="art-draw" pathLength={1} d={`M${89 + (i % 4) * 32} ${86 + Math.floor(i / 4) * 28} l5 5 l9 -9`} fill="none" stroke={GOOD} strokeWidth={3} strokeLinecap="round" />)}
    </Card>
    <Chip x={256} y={60} e="✈️" /><Chip x={262} y={136} e="💻" d={0.6} /><Chip x={44} y={150} e="📶" d={1.2} />
  </>),
  licence: () => (<>
    <g className="art-float"><path d="M160 30 L218 52 V100 C218 140 190 160 160 172 C130 160 102 140 102 100 V52Z" fill={PANEL} stroke={A} strokeWidth={5} strokeLinejoin="round" />
      <path className="art-draw" pathLength={1} d="M136 102 l16 16 l32 -34" fill="none" stroke={GOOD} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /></g>
    <Chip x={62} y={70} e="🔑" /><Chip x={262} y={64} e="🚦" d={0.7} /><Chip x={258} y={150} e="✅" d={1.3} />
  </>),
  doctrine: () => (<>
    <Clock cx={78} cy={104} r={36} speed={4} /><Clock cx={160} cy={92} r={44} speed={7} /><Clock cx={244} cy={104} r={36} speed={10} />
    <text x={78} y={162} textAnchor="middle" fontSize={11} fill={MUTED}>workshop</text><text x={160} y={158} textAnchor="middle" fontSize={11} fill={MUTED}>customer</text><text x={244} y={162} textAnchor="middle" fontSize={11} fill={MUTED}>road</text>
    <Chip x={292} y={40} e="📘" />
  </>),
  system: () => {
    const servers: [number, number][] = [[196, 46], [196, 92], [196, 138]];
    return (<>
      <g className="art-float"><circle cx={46} cy={92} r={22} fill={PANEL} stroke={LINE} strokeWidth={2} /><text x={46} y={99} textAnchor="middle" fontSize={20}>🌐</text></g>
      <rect x={96} y={74} width={50} height={36} rx={9} fill={A} /><text x={121} y={98} textAnchor="middle" fontSize={17}>⚖️</text>
      <path d="M68 92 H96" stroke={A} strokeWidth={3} strokeDasharray="6 6" className="art-road" />
      {servers.map(([x, y], i) => (
        <g key={i}>
          <path d={`M146 92 C170 92 170 ${y + 14} ${x} ${y + 14}`} fill="none" stroke={A} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="6 6" className="art-road" />
          <rect x={x} y={y} width={56} height={28} rx={6} fill={PANEL} stroke={LINE} />
          {[0, 1].map((k) => <circle key={k} className="art-twinkle" style={{ animationDelay: `${i * 0.4 + k * 0.2}s` }} cx={x + 10 + k * 9} cy={y + 14} r={2.6} fill={GOOD} />)}
          <rect x={x + 30} y={y + 11} width={18} height={6} rx={3} fill={LINE} />
        </g>
      ))}
      <g className="art-float" style={{ animationDelay: ".5s" }}>
        <ellipse cx={286} cy={70} rx={22} ry={7} fill={SOFT} stroke={A} strokeWidth={2} />
        <path d="M264 70 V112 a22 7 0 0 0 44 0 V70" fill={PANEL} stroke={A} strokeWidth={2} />
      </g>
      <path d="M252 106 H262" stroke={A} strokeWidth={2.5} strokeDasharray="4 4" className="art-road" />
      <Chip x={286} y={160} e="📨" d={0.9} /><Chip x={52} y={160} e="🔌" d={1.4} />
    </>);
  },
  legal: () => (<>
    <Card x={92} y={34} w={120} h={140}><Lines x={110} y={56} n={8} w={84} gap={13} /></Card>
    <g className="art-float"><path d="M226 74 L262 88 V116 C262 140 246 152 226 158 C206 152 190 140 190 116 V88Z" fill={PANEL} stroke={A} strokeWidth={4} /><text x={226} y={126} textAnchor="middle" fontSize={22}>🔒</text></g>
    <Chip x={58} y={64} e="⚖️" /><Chip x={64} y={150} e="©️" d={0.8} />
  </>),
};

/** The illustration for a page header. Decorative: hidden from assistive tech. */
export function PageArt({ kind, className = "" }: { kind: ArtKind; className?: string }) {
  return (
    <svg className={`page-art ${className}`} viewBox="0 0 320 200" aria-hidden="true" focusable="false">
      <Blob />
      {SCENES[kind]()}
    </svg>
  );
}

/** A matching emoji for a section or group title, so long pages scan by picture as well as by text. */
const EMOJI: [RegExp, string][] = [
  [/every kpi|indicator/i, "📊"], [/scorecard/i, "🏁"], [/league/i, "🏆"], [/driver kpi|driver register/i, "🧑‍✈️"], [/trend/i, "📈"],
  [/warranty|add-ons?/i, "🛡️"], [/system|architecture/i, "🏗️"], [/alert/i, "🚨"], [/compliance|licen[cs]e/i, "🪪"], [/fine|ticket/i, "🧾"], [/score band/i, "🎯"], [/safety/i, "🛡️"], [/activity log/i, "🗒️"],
  [/activity/i, "🛣️"], [/backlog|productivity/i, "⚙️"], [/budget|economics|cost/i, "💰"], [/car shape/i, "🚙"], [/column mapping/i, "🧭"],
  [/composition/i, "🧩"], [/data quality/i, "🧪"], [/fix it once/i, "🔁"], [/goodwill/i, "🤝"], [/lineage|work tree/i, "🌳"], [/my fleet data/i, "🗂️"],
  [/next action/i, "👉"], [/offline/i, "📴"], [/parts/i, "📦"], [/privacy/i, "🔒"], [/recall/i, "📣"], [/satisfaction|customer/i, "😊"],
  [/sites?\b/i, "📍"], [/fleet|uptime/i, "🚗"], [/maintenance|health/i, "🩺"], [/workshop/i, "🔧"], [/drivers? & trips|trips/i, "🧑‍✈️"],
];
export function emojiFor(title: unknown): string | null {
  if (typeof title !== "string") return null;
  return EMOJI.find(([re]) => re.test(title))?.[1] ?? null;
}
export const Emoji = ({ e, className = "" }: { e: string | null; className?: string }) =>
  e ? <span className={`emoji-tile ${className}`} aria-hidden="true">{e}</span> : null;
