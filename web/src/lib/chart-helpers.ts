/** Small helpers shared by the page charts. */

export const months = (rows: { month_start: string }[]) => [...new Set(rows.map((r) => r.month_start))].sort();

/** One smooth line per group (region, site, supplier…) over the sorted months. */
export function linesBy<T extends { month_start: string }>(
  rows: T[], key: (r: T) => string, value: (r: T) => number | null, width = 2,
) {
  const ms = months(rows);
  const idx = new Map<string, number | null>();
  for (const r of rows) idx.set(`${key(r)}|${r.month_start}`, value(r));
  return [...new Set(rows.map(key))].sort().map((k) => ({
    name: k, type: "line" as const, smooth: true, symbol: "none", lineStyle: { width },
    data: ms.map((m) => idx.get(`${k}|${m}`) ?? null),
  }));
}

export const monthLabels = (rows: { month_start: string }[]) => months(rows).map((m) => m.slice(0, 7));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Many groups on one time axis without a tangle: every group is a thin neutral line (named, so hovering shows it),
 * and one accent line carries the median across groups. Spread the result into the option.
 */
export function contextLines<T extends { month_start: string }>(
  rows: T[], key: (r: T) => string, value: (r: T) => number | null, label: string, dark: boolean,
  target?: { value: number; label: string },
) {
  const ms = months(rows);
  const groups = linesBy(rows, key, value, 1).map((s) => ({
    ...s, smooth: false, lineStyle: { width: 1, color: dark ? "#3a4159" : "#d3d7e2" },
    emphasis: { focus: "series" as const, lineStyle: { width: 2, color: dark ? "#c9cde0" : "#2b3150" } }, z: 1,
  }));
  const mid = ms.map((_, i) => {
    const v = groups.map((g) => g.data[i]).filter((x): x is number => x !== null && Number.isFinite(x));
    return median(v);
  });
  return {
    legend: { data: [label] },
    series: [...groups, { name: label, type: "line" as const, smooth: false, symbol: "none", z: 3,
      lineStyle: { width: 2.25, color: dark ? "#818cf8" : "#6366f1" }, itemStyle: { color: dark ? "#818cf8" : "#6366f1" }, data: mid,
      ...(target ? { markLine: { silent: true, symbol: "none", data: [{ yAxis: target.value }],
        label: { formatter: target.label, position: "insideStartTop" as const, color: dark ? "#9097b0" : "#5b6178", fontSize: 10.5 },
        lineStyle: { type: "dashed" as const, color: dark ? "#5d6480" : "#9aa0b4", width: 1 } } } : {}) }],
  };
}
