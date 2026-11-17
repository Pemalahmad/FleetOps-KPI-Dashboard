"use client";

import { useMemo } from "react";
import { series, type MonthPoint, type PanelRow } from "@/lib/metrics";
import { useEngine, useSql } from "./engine-provider";

export interface Target { kpi: string; green: number; amber: number; direction: string }

/** The region × month panel, its network (or region) series, and the targets. */
export function usePanel() {
  const { region } = useEngine();
  const panel = useSql<PanelRow>("SELECT * FROM mart_metric_panel ORDER BY month_start, region");
  const targets = useSql<Target>("SELECT kpi, green, amber, direction FROM cfg_targets");
  return useMemo(() => {
    const all = panel.data ?? [];
    const rows = region ? all.filter((r) => r.region === region) : all;
    const s: MonthPoint[] = rows.length ? series(rows) : [];
    const t = Object.fromEntries((targets.data ?? []).map((x) => [x.kpi, x])) as Record<string, Target>;
    return { all, rows, series: s, last: s.at(-1), prev: s.at(-2), targets: t, ready: !!panel.data && !!targets.data };
  }, [panel.data, targets.data, region]);
}
