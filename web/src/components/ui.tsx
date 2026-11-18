"use client";

import { Emoji, emojiFor, PageArt, type ArtKind } from "./art";

import katex from "katex";
import { HeaderDots, Shine, SpotCard } from "./bits/fleetops-bits";
import { useEffect, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import type { ReactNode } from "react";

export function Card({ children, className = "", title, sub, right }: {
  children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode;
}) {
  return (
    <SpotCard className={className}>
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
    </SpotCard>
  );
}

/** Split "Lead clause, the rest" so the second half can sit in a quieter tone. */
function split(text: string, at: RegExp): [string, string] {
  const m = text.match(at);
  if (!m || m.index === undefined) return [text, ""];
  const cut = m.index + m[0].length;
  return [text.slice(0, cut), text.slice(cut)];
}

/** Small monospace label with a square mark, used above page and section headlines. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`mono-label ${className}`}><span className="mono-mark" aria-hidden />{children}</span>;
}

export function PageHeader({ eyebrow, title, children, backdrop = false, art }: { eyebrow: string; title: string; children?: ReactNode; backdrop?: boolean; art?: ArtKind }) {
  const [lead, rest] = split(title, /[,:]\s/);
  return (
    <header className={[backdrop ? "page-head page-head-dots" : "page-head", art ? "page-head-art" : ""].join(" ")}>
      {backdrop && <HeaderDots />}
      {art && <PageArt kind={art} />}
      <Label>{eyebrow}</Label>
      <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[38px]">
        {lead}{rest && <Shine>{rest}</Shine>}
      </h1>
      {children && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const [lead, rest] = typeof sub === "string" ? split(sub, /[.;]\s/) : [null, null];
  return (
    <div className="section-head">
      <h2 className="flex items-center gap-2.5"><Emoji e={emojiFor(children)} className="emoji-sm" /><Label>{children}</Label></h2>
      {sub && (
        <p className="mt-2 max-w-4xl text-[17px] font-medium leading-snug tracking-[-0.015em] md:text-[19px]">
          {lead === null ? sub : <>{lead}{rest && <span className="text-faint">{rest}</span>}</>}
        </p>
      )}
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

export function Sparkline({ values, color = "var(--accent)", height = 34, fill = true, width = 1.8 }: { values: (number | null)[]; color?: string; height?: number; fill?: boolean; width?: number }) {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return <div style={{ height }} />;
  const min = Math.min(...v), max = Math.max(...v), w = 120;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, height - 3 - ((x - min) / (max - min || 1)) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      {fill && <path d={`${d}L${w},${height}L0,${height}Z`} fill={color} opacity={0.12} />}
      <path d={d} pathLength={1} className="spark-line" fill="none" stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const unitText = (unit: string) => (unit === "%" ? "%" : unit === "$" ? "" : unit ? " " + unit : "");

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

/** A number that counts up from zero the first time it scrolls into view (instant with reduced motion). */
export function CountIn({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const label = value.toLocaleString("en", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return (
    <span ref={ref} role="img" aria-label={label}>
      <span aria-hidden="true"><NumberFlow value={seen ? value : 0} format={{ maximumFractionDigits: decimals, minimumFractionDigits: decimals }} /></span>
    </span>
  );
}

/** Colour for a value only when it needs attention; on-target numbers stay in the text colour. */
export const attention = (r: Rag) => (r === "red" ? "var(--bad)" : r === "amber" ? "var(--warn)" : undefined);

/** A headline number in a shared grid: label, value, change, target, and a quiet trend line. */
export function Metric({
  label, value, unit = "", decimals = 1, prev, better = "higher", status = null, spark, hint, target,
}: {
  label: string; value: number | null | undefined; unit?: string; decimals?: number; prev?: number | null;
  better?: "higher" | "lower"; status?: Rag; spark?: (number | null)[]; hint?: string; target?: string;
}) {
  const has = value !== null && value !== undefined && Number.isFinite(value);
  const delta = has && prev !== null && prev !== undefined ? value - prev : null;
  return (
    <div className="ov-metric" title={hint}>
      <span className="block truncate text-[12.5px] text-muted">{label}</span>
      <span className="tnum mt-2 block text-[26px] font-semibold leading-none tracking-[-0.03em]" style={{ color: attention(status) }}>
        {!has ? <span className="text-faint">–</span> : (
          <>
            {unit === "$" && <span className="mr-0.5 text-[16px] font-medium text-muted">$</span>}
            <CountIn value={value} decimals={decimals} />
            {unit && unit !== "$" && <span className="ml-0.5 text-[13px] font-normal tracking-normal text-muted">{unitText(unit).trim()}</span>}
          </>
        )}
      </span>
      <span className="mt-2 flex items-center gap-1.5 text-[11.5px] text-faint">
        <Delta delta={delta} decimals={decimals} unit={unit} better={better} />
        {target && <span className="truncate">{delta !== null ? "· " : ""}{target}</span>}
      </span>
      {spark && <span className="mt-3 block"><Sparkline values={spark} height={22} fill={false} width={1.25} color="var(--faint)" /></span>}
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
              {has ? <CountIn value={it.value as number} decimals={it.decimals ?? 0} /> : <span className="text-faint">–</span>}
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
      <span className="min-w-0">
        <span className="block truncate text-[13px]">{label}</span>
        {target && <span className="block truncate text-[11px] text-faint">{target}</span>}
      </span>
      <span className="hidden w-[56px] sm:block">{spark && <Sparkline values={spark} height={18} fill={false} width={1.25} color="var(--faint)" />}</span>
      <span className="tnum text-right text-[13.5px] font-semibold" style={{ color: attention(status) }}>
        {has ? <>{unit === "$" && "$"}<CountIn value={value as number} decimals={decimals} /><span className="font-normal text-muted">{unitText(unit)}</span></> : <span className="text-faint">–</span>}
      </span>
      <span className="w-[62px] text-right text-[11px]"><Delta delta={delta} decimals={decimals} unit={unit} better={better} /></span>
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

