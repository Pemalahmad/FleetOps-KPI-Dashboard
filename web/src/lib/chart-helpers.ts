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
