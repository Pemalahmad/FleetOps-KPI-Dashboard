"use client";

import Link from "next/link";
import type { PipelineLog } from "@/lib/engine";

/**
 * The pipeline as a work tree: your files flow through checks and SQL models into the pages you use. Nodes carry the
 * live counts from this browser's run; connectors animate (SMIL in the SVG, no script) unless motion is reduced.
 */
type Node = { id: string; x: number; y: number; w: number; title: string; kind: string; rows: [string, string][]; href?: string; tone?: string };

const W = 1180, H = 430;

export function WorkTree({ log }: { log: PipelineLog }) {
  const count = (layer: string) => log.models.filter((m) => m.layer === layer);
  const rows = (layer: string) => count(layer).reduce((n, m) => n + m.rows, 0);
  const loaded = log.loads.filter((l) => l.source);
  const passed = log.tests.filter((t) => t.status === "pass").length;
  const warns = log.issues.filter((i) => i.severity !== "error").length, errors = log.issues.length - warns;
  const fmt = (n: number) => n.toLocaleString("en");
  const rules = log.stages.find((st) => /valid/i.test(st.name))?.detail.match(/(\d+)\s+rules/)?.[1] ?? "–";
  const nodes: Node[] = [
    { id: "src", x: 20, y: 120, w: 200, title: log.dataset === "demo" ? "Demo fleet files" : "Your files", kind: "Source",
      rows: [[`${loaded.length} tables`, ""], ...loaded.slice(0, 4).map((l) => [l.table, fmt(l.rows)] as [string, string])] },
    { id: "val", x: 270, y: 150, w: 190, title: "Ingest & validate", kind: "Checks",
      rows: [["Rules", rules], ["Warnings", String(warns)], ["Errors", String(errors)]], tone: errors ? "var(--bad)" : warns ? "var(--warn)" : undefined },
    { id: "sql", x: 510, y: 110, w: 200, title: "SQL models", kind: "DuckDB in this browser",
      rows: [["Staging", `${count("staging").length} · ${fmt(rows("staging"))}`], ["Intermediate", `${count("intermediate").length} · ${fmt(rows("intermediate"))}`],
        ["Marts", `${count("marts").length} · ${fmt(rows("marts"))}`], ["Run time", `${(log.totalMs / 1000).toFixed(1)} s`]] },
    { id: "test", x: 760, y: 165, w: 160, title: "Data tests", kind: "Assertions",
      rows: [["Passed", `${passed} / ${log.tests.length}`]], tone: passed < log.tests.length ? "var(--bad)" : undefined },
    { id: "garage", x: 975, y: 20, w: 185, title: "Garage", kind: "Output", rows: [["Next move per vehicle", ""]], href: "/" },
    { id: "reg", x: 975, y: 120, w: 185, title: "Fleet register", kind: "Output", rows: [["Identity · licence", ""]], href: "/fleet/" },
    { id: "kpi", x: 975, y: 220, w: 185, title: "Analytics", kind: "Output", rows: [["30 KPIs · scorecard", ""]], href: "/overview/" },
    { id: "net", x: 975, y: 320, w: 185, title: "Metric network", kind: "Output", rows: [["Identities · drivers", ""]], href: "/network/" },
  ];
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const h = (n: Node) => 46 + n.rows.length * 22;
  const port = (n: Node, side: "in" | "out") => ({ x: side === "out" ? n.x + n.w : n.x, y: n.y + 46 + (h(n) - 46) / 2 });
  const edges: [string, string][] = [["src", "val"], ["val", "sql"], ["sql", "test"], ["test", "garage"], ["test", "reg"], ["test", "kpi"], ["test", "net"]];
  const path = (a: Node, b: Node) => {
    const p = port(a, "out"), q = port(b, "in"), mx = (p.x + q.x) / 2, r = Math.min(10, Math.abs(q.y - p.y) / 2);
    if (Math.abs(q.y - p.y) < 1) return `M${p.x},${p.y}H${q.x}`;
    const s = q.y > p.y ? 1 : -1;
    return `M${p.x},${p.y}H${mx - r}Q${mx},${p.y} ${mx},${p.y + s * r}V${q.y - s * r}Q${mx},${q.y} ${mx + r},${q.y}H${q.x}`;
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="work-tree block min-w-[880px]" role="img"
        aria-label={`Pipeline: ${loaded.length} tables loaded, ${rules} rules checked, ${log.models.length} SQL models built, ${passed} of ${log.tests.length} tests passed, feeding the garage, register, analytics and metric network.`}>
        {edges.map(([a, b], i) => {
          const d = path(by[a], by[b]);
          return (
            <g key={a + b}>
              <path d={d} className="wt-edge" />
              <path d={d} className="wt-flow" />
              <circle r="3.2" className="wt-packet">
                <animateMotion dur={`${2.4 + (i % 3) * 0.4}s`} begin={`${i * 0.35}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}
        {nodes.map((n) => {
          const body = (
            <g transform={`translate(${n.x},${n.y})`} className={n.href ? "wt-node wt-link" : "wt-node"}>
              <rect width={n.w} height={h(n)} rx="8" className="wt-box" />
              <rect x="12" y="12" width="22" height="22" rx="5" className="wt-icon" style={n.tone ? { fill: n.tone } : undefined} />
              <text x="44" y="22" className="wt-title">{n.title}</text>
              <text x="44" y="36" className="wt-kind">{n.kind}</text>
              {n.rows.map(([k, v], i) => (
                <g key={k} transform={`translate(12,${50 + i * 22})`}>
                  <rect width={n.w - 24} height="18" rx="4" className="wt-row" />
                  <text x="8" y="12.5" className="wt-key">{k}</text>
                  {v && <text x={n.w - 32} y="12.5" textAnchor="end" className="wt-val">{v}</text>}
                </g>
              ))}
              <circle cx="0" cy={46 + (h(n) - 46) / 2} r="3.5" className="wt-port" />
              <circle cx={n.w} cy={46 + (h(n) - 46) / 2} r="3.5" className="wt-port" />
            </g>
          );
          return n.href ? <Link key={n.id} href={n.href}>{body}</Link> : <g key={n.id}>{body}</g>;
        })}
        <g className="wt-cursor">
          <animateMotion dur="9s" repeatCount="indefinite" keyPoints="0;0.25;0.5;0.75;1" keyTimes="0;0.25;0.5;0.75;1" calcMode="linear"
            path={`M${by.src.x + 150},${by.src.y + 10} L${by.val.x + 140},${by.val.y + 10} L${by.sql.x + 150},${by.sql.y + 10} L${by.test.x + 110},${by.test.y + 10} L${by.kpi.x + 120},${by.kpi.y + 10}`} />
          <path d="M0,0 L0,14 L4,10 L9,16 L11,15 L6,9 L12,9 Z" className="wt-cursor-arrow" />
          <rect x="12" y="10" width="112" height="20" rx="4" className="wt-cursor-tag" />
          <text x="20" y="24" className="wt-cursor-text">Runs in your browser</text>
        </g>
      </svg>
    </div>
  );
}
