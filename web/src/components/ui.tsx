"use client";

import katex from "katex";
import NumberFlow from "@number-flow/react";
import type { ReactNode } from "react";

export function Card({ children, className = "", title, sub, right }: {
  children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-[15px] font-semibold">{title}</h3>}
            {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <p className="text-[13px] font-semibold text-accent">{eyebrow}</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight md:text-[32px]">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 mt-10 first:mt-0">
      <h2 className="text-[19px] font-semibold">{children}</h2>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

/** KaTeX, rendered to a string (no DOM ownership issues with React). */
export function Tex({ children, block = false, className = "" }: { children: string; block?: boolean; className?: string }) {
  const html = katex.renderToString(children, { throwOnError: false, displayMode: block, output: "html" });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export type Rag = "green" | "amber" | "red" | null;
export const ragColor = (r: Rag) => (r === "green" ? "var(--good)" : r === "amber" ? "var(--warn)" : r === "red" ? "var(--bad)" : "var(--faint)");

export function rag(value: number | null | undefined, t?: { green: number; amber: number; direction: string }): Rag {
  if (value === null || value === undefined || !Number.isFinite(value) || !t) return null;
  if (t.direction === "higher") return value >= t.green ? "green" : value >= t.amber ? "amber" : "red";
  return value <= t.green ? "green" : value <= t.amber ? "amber" : "red";
}

export function Sparkline({ values, color = "var(--accent)", height = 34 }: { values: (number | null)[]; color?: string; height?: number }) {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return <div style={{ height }} />;
  const min = Math.min(...v), max = Math.max(...v), w = 120;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, height - 3 - ((x - min) / (max - min || 1)) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={`${d}L${w},${height}L0,${height}Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Tile({
  label, value, unit = "", decimals = 1, prev, better = "higher", status = null, spark, hint,
}: {
  label: string; value: number | null | undefined; unit?: string; decimals?: number; prev?: number | null;
  better?: "higher" | "lower"; status?: Rag; spark?: (number | null)[]; hint?: string;
}) {
  const delta = value !== null && value !== undefined && prev !== null && prev !== undefined ? value - prev : null;
  const good = delta === null || Math.abs(delta) < 1e-9 ? null : (delta > 0) === (better === "higher");
  return (
    <div className="card relative overflow-hidden p-4" title={hint}>
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ragColor(status) }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="tnum mt-1.5 text-[26px] font-semibold leading-none">
        {value === null || value === undefined || !Number.isFinite(value) ? (
          <span className="text-faint">–</span>
        ) : (
          <>
            {unit === "$" && <span className="mr-0.5 text-[18px] text-muted">$</span>}
            <NumberFlow value={value} format={{ maximumFractionDigits: decimals, minimumFractionDigits: decimals }} />
            {unit && unit !== "$" && <span className="ml-1 text-[15px] font-medium text-muted">{unit}</span>}
          </>
        )}
      </div>
      <div className="mt-1 h-5 text-[12px]">
        {delta !== null && (
          <span className="tnum font-medium" style={{ color: good === null ? "var(--muted)" : good ? "var(--good)" : "var(--bad)" }}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toFixed(decimals)}
            {unit === "%" ? " pp" : unit && unit !== "$" ? ` ${unit}` : ""} <span className="text-faint">vs last month</span>
          </span>
        )}
      </div>
      {spark && <Sparkline values={spark} color={good === false ? "var(--bad)" : "var(--accent)"} />}
    </div>
  );
}

export function Skeleton({ height = 280 }: { height?: number }) {
  return <div className="animate-pulse rounded-xl bg-panel-2" style={{ height }} />;
}

export const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–"
  : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

export function pFmt(p: number) {
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

