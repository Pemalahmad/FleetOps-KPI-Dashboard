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

const unitText = (unit: string) => (unit === "%" ? "%" : unit === "$" ? "" : unit ? " " + unit : "");
const statusWord = (r: Rag) => (r === "green" ? "On target" : r === "amber" ? "Watch" : r === "red" ? "Off target" : null);

/** Signed change against last month, coloured by whether it moved the right way. */
export function Delta({ delta, decimals, unit, better }: { delta: number | null; decimals: number; unit: string; better: "higher" | "lower" }) {
  if (delta === null) return null;
  const flat = Math.abs(delta) < 0.5 * 10 ** -decimals;
  const good = flat ? null : (delta > 0) === (better === "higher");
  return (
    <span className="kpi-delta tnum" style={{ color: good === null ? "var(--muted)" : good ? "var(--good)" : "var(--bad)" }}>
      {flat ? "±" : delta > 0 ? "+" : "−"}{Math.abs(delta).toFixed(decimals)}{unit === "%" ? " pp" : unit && unit !== "$" ? " " + unit : ""}
    </span>
  );
}

export function Tile({
  label, value, unit = "", decimals = 1, prev, better = "higher", status = null, spark, hint,
}: {
  label: string; value: number | null | undefined; unit?: string; decimals?: number; prev?: number | null;
  better?: "higher" | "lower"; status?: Rag; spark?: (number | null)[]; hint?: string;
}) {
  const has = value !== null && value !== undefined && Number.isFinite(value);
  const delta = has && prev !== null && prev !== undefined ? value - prev : null;
  const word = statusWord(status);
  return (
    <div className="kpi-tile" title={hint} style={{ ["--kpi" as string]: ragColor(status) }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] leading-snug text-muted">{label}</span>
        {word && <span className="kpi-flag">{word}</span>}
      </div>
      <div className="tnum mt-2 text-[25px] font-semibold leading-none tracking-[-0.03em]">
        {!has ? <span className="text-faint">–</span> : (
          <>
            {unit === "$" && <span className="mr-0.5 text-[16px] font-medium text-muted">$</span>}
            <NumberFlow value={value} format={{ maximumFractionDigits: decimals, minimumFractionDigits: decimals }} />
            {unit && unit !== "$" && <span className="ml-0.5 text-[13px] font-medium tracking-normal text-muted">{unitText(unit).trim()}</span>}
          </>
        )}
      </div>
      <div className="mt-1.5 flex h-4 items-center gap-1.5 text-[11px]">
        <Delta delta={delta} decimals={decimals} unit={unit} better={better} />
        {delta !== null && <span className="text-faint">vs last month</span>}
      </div>
      {spark && <div className="kpi-spark"><Sparkline values={spark} height={28} color={status === "red" ? "var(--bad)" : "var(--accent)"} /></div>}
    </div>
  );
}

/** One row of compact headline numbers in a single card: no box per number, hairlines between them. */
export function StatStrip({ items }: {
  items: { label: string; value: number | null | undefined; unit?: string; decimals?: number; status?: Rag; note?: string }[];
}) {
  return (
    <div className="stat-strip">
      {items.map((it) => {
        const has = it.value !== null && it.value !== undefined && Number.isFinite(it.value);
        return (
          <div key={it.label} className="stat-strip-item">
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
              {it.status && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ragColor(it.status) }} />}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="tnum mt-1 block text-[20px] font-semibold leading-none tracking-[-0.02em]">
              {has ? fmt(it.value, it.decimals ?? 0) : <span className="text-faint">–</span>}
              {has && it.unit && <span className="ml-0.5 text-[12px] font-medium tracking-normal text-muted">{unitText(it.unit).trim()}</span>}
            </span>
            {it.note && <span className="mt-1 block truncate text-[11px] text-faint">{it.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A dense KPI line for grouped panels: label, trend, value, change and target state. */
export function KpiRow({ label, value, unit = "", decimals = 1, prev, better = "higher", status = null, spark, hint, target }: {
  label: string; value: number | null | undefined; unit?: string; decimals?: number; prev?: number | null;
  better?: "higher" | "lower"; status?: Rag; spark?: (number | null)[]; hint?: string; target?: string;
}) {
  const has = value !== null && value !== undefined && Number.isFinite(value);
  const delta = has && prev !== null && prev !== undefined ? value - prev : null;
  return (
    <div className="kpi-row" title={hint}>
      <span className="kpi-row-bar" style={{ background: ragColor(status) }} />
      <span className="min-w-0">
        <span className="block truncate text-[12.5px]">{label}</span>
        {target && <span className="block truncate text-[11px] text-faint">{target}</span>}
      </span>
      <span className="hidden w-[64px] sm:block">{spark && <Sparkline values={spark} height={20} color={status === "red" ? "var(--bad)" : "var(--accent)"} />}</span>
      <span className="text-right">
        <span className="tnum block text-[14px] font-semibold">
          {has ? <>{unit === "$" && "$"}{fmt(value, decimals)}{unitText(unit)}</> : <span className="text-faint">–</span>}
        </span>
        <span className="block h-[14px] text-[10.5px]"><Delta delta={delta} decimals={decimals} unit={unit} better={better} /></span>
      </span>
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

