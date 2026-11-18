"use client";

import Link from "next/link";
import type { PipelineLog } from "@/lib/engine";

/**
 * The pipeline drawn as a workflow canvas: a window with the run log on the left and nodes on a dotted canvas, each with
 * its inputs and outputs, wired output-to-input. Every number is this browser's run. Motion is SMIL inside the SVG (no
 * script) and is hidden when the reader prefers reduced motion. Nothing here is a control except the output links.
 */
const VW = 1240, VH = 620, CANVAS_X = 312, NODE_W = 160;

type Out = { label: string; value?: string };
type Node = { id: string; x: number; y: number; title: string; kind: string; glyph: string; tint: string; input?: string; outputs: Out[]; href?: string };

const AGENTS = [
  { name: "Validator", color: "#2dd4bf" },
  { name: "SQL engine", color: "#facc15" },
  { name: "Test runner", color: "#a78bfa" },
];

const nodeH = (n: Node) => 46 + (n.input ? 26 : 0) + (n.outputs.length ? 22 + n.outputs.length * 24 + 6 : 0);
const outY = (n: Node, i: number) => n.y + 46 + (n.input ? 26 : 0) + 22 + i * 24 + 10;
const inY = (n: Node) => n.y + 46 + 13;

export function WorkTree({ log }: { log: PipelineLog }) {
  const fmt = (n: number) => n.toLocaleString("en");
  const layer = (l: string) => log.models.filter((m) => m.layer === l);
  const rowsOf = (l: string) => layer(l).reduce((n, m) => n + m.rows, 0);
  const loaded = log.loads.filter((l) => l.source).sort((a, b) => b.rows - a.rows);
  const passed = log.tests.filter((t) => t.status === "pass").length, failed = log.tests.length - passed;
  const warns = log.issues.filter((i) => i.severity !== "error").length, errors = log.issues.length - warns;
  const rules = log.stages.find((s) => /valid/i.test(s.name))?.detail.match(/(\d+)\s+rules/)?.[1] ?? "–";
  const ok = log.ok && !failed;

  const files: Node = { id: "files", x: CANVAS_X + 16, y: 120, title: log.dataset === "demo" ? "Demo fleet" : "Your files", kind: "Source", glyph: "▤", tint: "#e0e7ff",
    outputs: loaded.slice(0, 5).map((l) => ({ label: l.table, value: fmt(l.rows) })) };
  const check: Node = { id: "check", x: CANVAS_X + 196, y: 92, title: "Ingest & validate", kind: "Checks", glyph: "✓", tint: "#ccfbf1", input: `${loaded.length} tables`,
    outputs: [{ label: "Rules checked", value: rules }, { label: "Warnings", value: String(warns) }, { label: "Errors", value: String(errors) }] };
  const sql: Node = { id: "sql", x: CANVAS_X + 376, y: 150, title: "SQL models", kind: "DuckDB · in browser", glyph: "⌘", tint: "#fef9c3", input: "Clean rows",
    outputs: [{ label: "Staging", value: `${layer("staging").length} · ${fmt(rowsOf("staging"))}` }, { label: "Intermediate", value: `${layer("intermediate").length} · ${fmt(rowsOf("intermediate"))}` },
      { label: "Marts", value: `${layer("marts").length} · ${fmt(rowsOf("marts"))}` }] };
  const tests: Node = { id: "tests", x: CANVAS_X + 556, y: 210, title: "Data tests", kind: "Conditional", glyph: "⑂", tint: "#ede9fe", input: "Marts",
    outputs: [{ label: "Pass → publish", value: `${passed}` }, { label: "Fail → hold", value: `${failed}` }] };
  const outs: Node[] = [
    { id: "garage", x: CANVAS_X + 736, y: 70, title: "Garage", kind: "Output", glyph: "◫", tint: "#e0e7ff", input: "Next moves", outputs: [], href: "/" },
    { id: "reg", x: CANVAS_X + 736, y: 180, title: "Fleet register", kind: "Output", glyph: "≡", tint: "#e0e7ff", input: "Identity, licence", outputs: [], href: "/fleet/" },
    { id: "kpi", x: CANVAS_X + 736, y: 290, title: "Analytics", kind: "Output", glyph: "◔", tint: "#e0e7ff", input: "30 KPIs", outputs: [], href: "/overview/" },
    { id: "net", x: CANVAS_X + 736, y: 400, title: "Metric network", kind: "Output", glyph: "⋈", tint: "#e0e7ff", input: "KPI links", outputs: [], href: "/network/" },
  ];
  const nodes = [files, check, sql, tests, ...outs];

  // wires: from a named output row to the next node's input row
  const wire = (a: Node, i: number, b: Node) => {
    const p = { x: a.x + NODE_W, y: outY(a, i) }, q = { x: b.x, y: inY(b) };
    const mx = p.x + (q.x - p.x) / 2, r = Math.min(8, Math.abs(q.y - p.y) / 2);
    if (Math.abs(q.y - p.y) < 1) return `M${p.x},${p.y}H${q.x}`;
    const s = q.y > p.y ? 1 : -1;
    return `M${p.x},${p.y}H${mx - r}Q${mx},${p.y} ${mx},${p.y + s * r}V${q.y - s * r}Q${mx},${q.y} ${mx + r},${q.y}H${q.x}`;
  };
  const wires = [
    ...files.outputs.map((_, i) => wire(files, i, check)),
    wire(check, 0, sql),
    wire(sql, 2, tests),
    ...outs.map((o) => wire(tests, 0, o)),
  ];

  const cursors = [
    { a: AGENTS[0], pts: [[check.x + 120, check.y + 70], [check.x + 150, check.y + 120], [files.x + 140, files.y + 90], [check.x + 120, check.y + 70]] },
    { a: AGENTS[1], pts: [[sql.x + 130, sql.y + 96], [sql.x + 60, sql.y + 140], [sql.x + 150, sql.y + 120], [sql.x + 130, sql.y + 96]] },
    { a: AGENTS[2], pts: [[tests.x + 120, tests.y + 100], [outs[1].x + 40, outs[1].y + 50], [outs[2].x + 60, outs[2].y + 40], [tests.x + 120, tests.y + 100]] },
  ];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${VW} ${VH}`} className="wf block min-w-[960px]" role="img"
        aria-label={`Pipeline run: ${loaded.length} tables loaded, ${rules} rules checked with ${warns} warnings and ${errors} errors, ${log.models.length} SQL models built, ${passed} of ${log.tests.length} tests passed; outputs feed the garage, fleet register, analytics and metric network.`}>
        <defs>
          <pattern id="wf-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="wf-dot" /></pattern>
          <clipPath id="wf-canvas"><rect x={CANVAS_X} y="48" width={VW - CANVAS_X - 12} height={VH - 60} rx="10" /></clipPath>
        </defs>

        {/* window */}
        <rect x="0" y="0" width={VW} height={VH} rx="22" className="wf-frame" />
        <g transform="translate(22,15)">
          <rect width="18" height="18" rx="5" className="wf-logo" /><text x="5" y="13" className="wf-logo-text">F</text>
          <text x="28" y="13.5" className="wf-title">FleetOps pipeline</text>
          <rect x="138" y="1" width="68" height="16" rx="4" className="wf-chip" /><text x="146" y="12.5" className="wf-chip-text">{log.snapshot.slice(0, 10)}</text>
        </g>
        <g transform={`translate(${VW - 150},13)`}>
          <rect width="128" height="22" rx="6" className={ok ? "wf-status" : "wf-status wf-status-bad"} />
          <circle cx="13" cy="11" r="3.5" className={ok ? "wf-status-dot" : "wf-status-dot wf-bad"} />
          <text x="24" y="15" className="wf-status-text">{ok ? "Built · published" : "Held · check tests"}</text>
        </g>

        {/* run log */}
        <g transform="translate(14,48)">
          <rect width={CANVAS_X - 26} height={VH - 60} rx="10" className="wf-panel" />
          <foreignObject x="12" y="12" width={CANVAS_X - 50} height="78">
            <p className="wf-brief">Build the fleet report from {loaded.length} tables: check, model, test, then publish to the garage, register, analytics and network.</p>
          </foreignObject>
          <g transform="translate(14,104)">
            {AGENTS.map((a, i) => <rect key={a.name} x={i * 14} y="0" width="11" height="11" rx="3" fill={a.color} />)}
            <text x="50" y="9.5" className="wf-log-strong">Pipeline ran</text>
            <text x={CANVAS_X - 54} y="9.5" textAnchor="end" className="wf-log-dim">{(log.totalMs / 1000).toFixed(1)} s</text>
            <text x="0" y="34" className="wf-mono">PROGRESS</text>
            <text x={CANVAS_X - 54} y="34" textAnchor="end" className="wf-mono">{log.stages.filter((s) => s.status !== "failed").length}/{log.stages.length}</text>
            <rect x="0" y="40" width={CANVAS_X - 54} height="5" rx="2.5" className="wf-track" />
            <rect x="0" y="40" width={(CANVAS_X - 54) * (log.stages.filter((s) => s.status !== "failed").length / Math.max(1, log.stages.length))} height="5" rx="2.5" className="wf-bar" />
            <text x="0" y="70" className="wf-mono">STAGES</text>
            {log.stages.map((s, i) => (
              <g key={s.name} transform={`translate(0,${84 + i * 46})`}>
                <circle cx="6" cy="6" r="6" className={s.status === "ok" ? "wf-ok" : s.status === "warn" ? "wf-warn" : "wf-fail"} />
                <path d="M3.5,6.2 L5.4,8 L8.8,4.4" className="wf-tick" />
                <text x="20" y="10" className="wf-log-strong">{s.name}</text>
                <text x={CANVAS_X - 54} y="10" textAnchor="end" className="wf-log-dim">{s.ms ? `${Math.round(s.ms)} ms` : ""}</text>
                <text x="20" y="27" className="wf-log-dim">{s.detail.length > 40 ? s.detail.slice(0, 39) + "…" : s.detail}</text>
              </g>
            ))}
          </g>
        </g>

        {/* canvas */}
        <rect x={CANVAS_X} y="48" width={VW - CANVAS_X - 12} height={VH - 60} rx="10" className="wf-canvas" />
        <rect x={CANVAS_X} y="48" width={VW - CANVAS_X - 12} height={VH - 60} rx="10" fill="url(#wf-dots)" />
        <g clipPath="url(#wf-canvas)">
          {wires.map((d, i) => (
            <g key={i}>
              <path d={d} className="wf-wire" />
              <circle r="2.6" className="wf-packet"><animateMotion dur={`${2.2 + (i % 4) * 0.3}s`} begin={`${(i * 0.27) % 2}s`} repeatCount="indefinite" path={d} /></circle>
            </g>
          ))}
          {nodes.map((n) => {
            const h = nodeH(n);
            const body = (
              <g transform={`translate(${n.x},${n.y})`} className={n.href ? "wf-node wf-link" : "wf-node"}>
                <rect width={NODE_W} height={h} rx="9" className="wf-card" />
                <rect x="10" y="10" width="26" height="26" rx="6" fill={n.tint} className="wf-icon" />
                <text x="23" y="28" textAnchor="middle" className="wf-glyph">{n.glyph}</text>
                <text x="44" y="21" className="wf-node-title">{n.title}</text>
                <text x="44" y="34" className="wf-node-kind">{n.kind}</text>
                {n.input && (
                  <g transform="translate(0,46)">
                    <line x1="0" x2={NODE_W} y1="0" y2="0" className="wf-sep" />
                    <text x="10" y="17" className="wf-mono-dark">INPUT</text>
                    <text x="56" y="17" className="wf-io">{n.input}</text>
                    <circle cx="0" cy="13" r="3.3" className="wf-port" />
                  </g>
                )}
                {(n.outputs.length > 0 || !n.input) && (
                  <g transform={`translate(0,${46 + (n.input ? 26 : 0)})`}>
                    <line x1="0" x2={NODE_W} y1="0" y2="0" className="wf-sep" />
                    <text x="10" y="15" className="wf-mono-dark">OUTPUTS</text>
                    {n.outputs.map((o, i) => (
                      <g key={o.label} transform={`translate(10,${22 + i * 24})`}>
                        <rect width={NODE_W - 20} height="19" rx="4" className="wf-pill" />
                        <text x="7" y="13" className="wf-pill-text">{o.label}</text>
                        {o.value && <text x={NODE_W - 27} y="13" textAnchor="end" className="wf-pill-val">{o.value}</text>}
                        <circle cx={NODE_W - 10} cy="10" r="3.3" className="wf-port" />
                      </g>
                    ))}
                  </g>
                )}
              </g>
            );
            return n.href ? <Link key={n.id} href={n.href} aria-label={`Open ${n.title}`}>{body}</Link> : <g key={n.id}>{body}</g>;
          })}
          {cursors.map(({ a, pts }, i) => (
            <g key={a.name} className="wf-cursor">
              <animateMotion dur={`${7 + i * 1.5}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" path={"M" + pts.map((p) => p.join(",")).join(" L")} />
              <path d="M0,0 L0,15 L4.2,11 L8.6,18 L11,16.8 L6.8,10 L12.4,9.6 Z" fill={a.color} className="wf-arrow" />
              <rect x="13" y="13" width={a.name.length * 7 + 14} height="20" rx="4" fill={a.color} />
              <text x="20" y="27" className="wf-tag">{a.name}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
