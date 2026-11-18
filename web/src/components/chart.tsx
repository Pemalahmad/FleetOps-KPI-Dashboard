"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export { useTheme } from "./use-theme";
import { useTheme } from "./use-theme";

export const PALETTE = ["#6366F1", "#94A3B8", "#A5B4FC", "#475569", "#C7D2FE", "#64748B", "#4338CA", "#CBD5E1"];
/** Status colours, used only where a mark means good, watch or bad. */
export const STATUS = { good: "#34A37E", warn: "#E0A63A", bad: "#E05A6B", neutral: "#A3AAC0", goodSoft: "#9ED3BE", badSoft: "#F0A9B2" };
/** Ordered steps from fine to urgent (age buckets, ratings, heat). */
export const RISK_SCALE = ["#CBD5E1", "#94A3B8", "#E0A63A", "#E05A6B"];

export function tokens(dark: boolean) {
  return dark
    ? { text: "#e8eaf3", muted: "#9097b0", faint: "#5d6480", grid: "#232839", panel: "#11141f", good: "#34d399", warn: "#fbbf24", bad: "#fb7185", accent: "#818cf8" }
    : { text: "#0f1222", muted: "#5b6178", faint: "#9aa0b4", grid: "#e9ecf3", panel: "#ffffff", good: "#059669", warn: "#d97706", bad: "#e11d48", accent: "#6366f1" };
}

/** House style applied under every option: transparent background, quiet axes, readable tooltips. */
function base(dark: boolean): EChartsOption {
  const t = tokens(dark);
  const axis = {
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, type: "dashed" as const } },
    nameTextStyle: { color: t.muted, fontSize: 11 },
  };
  return {
    backgroundColor: "transparent",
    color: PALETTE,
    textStyle: { fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: t.text },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { textStyle: { color: t.muted, fontSize: 11 }, icon: "circle", itemWidth: 7, itemHeight: 7, itemGap: 14, top: 0, right: 0 },
    tooltip: {
      renderMode: "richText", // Draw imported labels on canvas; never interpret them as HTML.
      backgroundColor: t.panel, borderColor: t.grid, textStyle: { color: t.text, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);",
    },
    xAxis: axis as never,
    yAxis: axis as never,
  };
}

function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const av = out[k];
    if (Array.isArray(v) && av && !Array.isArray(av) && typeof av === "object")
      out[k] = v.map((x) => (x && typeof x === "object" ? merge(av as Record<string, unknown>, x) : x));
    else if (v && typeof v === "object" && !Array.isArray(v) && av && typeof av === "object" && !Array.isArray(av))
      out[k] = merge(av as Record<string, unknown>, v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export function Chart({
  option, height = 300, onClick, className = "",
}: {
  option: (dark: boolean) => EChartsOption;
  height?: number;
  onClick?: (p: echarts.ECElementEvent) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const dark = useTheme();
  const click = useRef(onClick);
  useEffect(() => {
    click.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
    inst.current = c;
    c.on("click", (p) => click.current?.(p));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    const opt = option(dark) as Record<string, unknown>;
    const b = base(dark) as Record<string, unknown>;
    if (!("xAxis" in opt)) {
      delete b.xAxis;
      delete b.yAxis;
      delete b.grid;
    }
    inst.current?.setOption(merge(b, opt) as EChartsOption, true);
  }, [option, dark]);

  return <div ref={ref} style={{ height }} className={`w-full ${className}`} />;
}

