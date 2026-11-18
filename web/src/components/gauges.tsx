"use client";

import Gauge, { type GaugeThreshold } from "./arc/gauge";

/** Bands for a higher-is-better KPI: off target below `target - near`, close within `near`, on target at or above it. */
export function bands(target: number, near = 5): GaugeThreshold[] {
  return [{ from: 0, tone: "danger", label: "Off target" }, { from: target - near, tone: "warning", label: "Close to target" }, { from: target, tone: "success", label: "On target" }];
}

export interface GaugeItem { label: string; value: number | null | undefined; target?: number; near?: number; max?: number; detail?: string }

/** A row of Arc ring gauges for headline KPIs. A KPI with no value yet is left out rather than drawn at zero. */
export function GaugeRow({ items, label }: { items: GaugeItem[]; label: string }) {
  const shown = items.filter((g) => g.value !== null && g.value !== undefined && Number.isFinite(g.value));
  if (!shown.length) return null;
  return (
    <section className="gauge-row" aria-label={label}>
      {shown.map((g) => (
        <Gauge key={g.label} label={g.label} value={Number((g.value as number).toFixed(1))} max={g.max ?? 100}
          detail={g.detail ?? (g.target !== undefined ? `Target ${g.target}${(g.max ?? 100) === 100 ? "%" : ""}` : undefined)}
          thresholds={g.target !== undefined ? bands(g.target, g.near) : undefined} />
      ))}
    </section>
  );
}
