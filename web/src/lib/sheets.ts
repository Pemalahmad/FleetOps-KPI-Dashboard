/**
 * Read whatever a fleet owner has (Excel workbooks with any number of sheets, CSV, Parquet, JSON) and work out,
 * for each sheet, which contract table it is and how its columns map. Pure functions where possible, so the
 * guessing is unit-tested (sheets.test.ts).
 */
import * as XLSX from "xlsx";

export interface ColumnLike {
  name: string;
  required: boolean;
  synonyms: string[];
  shared?: boolean;
}
export interface TableLike {
  name: string;
  required: boolean;
  columns: ColumnLike[];
}

export interface Sheet {
  id: string;              // file name + sheet name
  file: string;
  sheet: string | null;
  headers: string[];
  rows: (string | null)[][]; // every data row, as text (dates already ISO)
  kind: "tabular" | "parquet" | "json";
  bytes?: Uint8Array;      // for parquet / json, passed through to DuckDB as-is
}

export const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const pad = (n: number) => String(n).padStart(2, "0");
function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    // SheetJS returns Excel dates as local-time Date objects; keep the calendar date and time as written.
    const t = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    return v.getHours() || v.getMinutes() ? `${t} ${pad(v.getHours())}:${pad(v.getMinutes())}` : t;
  }
  return String(v).trim() || null;
}

/** All synonyms of all tables, normalised: used to recognise the header row under any title rows. */
export function knownHeaders(tables: TableLike[]): Set<string> {
  return new Set(tables.flatMap((t) => t.columns.flatMap((c) => [c.name, ...c.synonyms].map(norm))));
}

/** The header row: within the first 15 rows, the row with the most cells that look like known column names. */
export function headerRow(grid: unknown[][], known: Set<string>): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const cells = grid[i].map((c) => (typeof c === "string" ? c : c == null ? "" : String(c)));
    const filled = cells.filter((c) => c.trim()).length;
    const hits = cells.filter((c) => known.has(norm(c))).length;
    const score = hits * 10 + filled;
    if (filled >= 2 && score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Read one uploaded file into sheets. */
export async function readFile(file: File, tables: TableLike[]): Promise<Sheet[]> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buf = new Uint8Array(await file.arrayBuffer());
  if (ext === "parquet" || ext === "json") {
    return [{ id: file.name, file: file.name, sheet: null, headers: [], rows: [], kind: ext, bytes: buf }];
  }
  const wb = XLSX.read(buf, { type: "array", cellDates: true, dense: true });
  const known = knownHeaders(tables);
  return wb.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    const h = headerRow(grid, known);
    const headers = (grid[h] ?? []).map((c, i) => cellText(c) ?? `column_${i + 1}`);
    const rows = grid.slice(h + 1).map((r) => headers.map((_, i) => cellText(r[i])))
      .filter((r) => r.some((c) => c !== null));
    return {
      id: wb.SheetNames.length > 1 ? `${file.name} · ${name}` : file.name, file: file.name,
      sheet: wb.SheetNames.length > 1 ? name : null, headers, rows, kind: "tabular" as const,
    };
  }).filter((s) => s.headers.length >= 2 && s.rows.length > 0);
}

/** CSV text (RFC 4180 quoting) for DuckDB, with the original headers. */
export function toCsv(sheet: Sheet): string {
  const q = (v: string | null) => (v === null ? "" : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [sheet.headers.map(q).join(","), ...sheet.rows.map((r) => r.map(q).join(","))].join("\n");
}

// ---------------------------------------------------------------------------------------- guessing
const NAME_HINTS: Record<string, RegExp> = {
  vehicles: /vehicle|fleet|vin|asset|register|car|truck|van|unit/,
  documents: /document|registration|mulkiya|istimara|insurance|polic|permit|card/,
  work_orders: /work.?order|service|job|repair|maintenance|workshop.?visit/,
  sites: /site|depot|workshop|branch|location/,
  usage: /usage|odometer|mileage|distance|trip|utili[sz]ation/,
  energy: /fuel|energy|charg|kwh|litre/,
  feedback: /feedback|rating|survey|csat|nps/,
  parts_orders: /part/,
  fines: /fine|violation|ticket|penalt|salik|toll/,
  recalls: /recall|campaign/,
  budgets: /budget/,
};

/** Map source headers to one table's columns, using the same rules as the Python ingest (shared ids may repeat). */
export function guessMapping(headers: string[], table: TableLike): Record<string, string | null> {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const c of table.columns) {
    let src: string | null = null;
    for (const cand of [c.name, ...c.synonyms]) {
      const hit = byNorm.get(norm(cand));
      if (hit && (c.shared || !used.has(hit))) {
        src = hit;
        break;
      }
    }
    if (src) used.add(src);
    out[c.name] = src;
  }
  return out;
}

export interface Guess {
  table: string | null;
  score: number;
  mapping: Record<string, string | null>;
}

/** Which table is this sheet? Score = mapped columns (required count double) + a bonus when the name hints at it. */
export function guessTable(sheet: Pick<Sheet, "headers" | "file" | "sheet">, tables: TableLike[]): Guess {
  const label = norm(`${sheet.file} ${sheet.sheet ?? ""}`).replace(/_/g, " ");
  let best: Guess = { table: null, score: 0, mapping: {} };
  for (const t of tables) {
    const mapping = guessMapping(sheet.headers, t);
    const hits = t.columns.filter((c) => mapping[c.name]);
    let score = hits.reduce((s, c) => s + (c.required ? 2 : 1), 0);
    if (norm(label).includes(t.name) || NAME_HINTS[t.name]?.test(label)) score += 3;
    // a table whose required columns are all present beats one that only shares generic names
    if (t.columns.filter((c) => c.required).every((c) => mapping[c.name])) score += 4;
    if (score > best.score) best = { table: t.name, score, mapping };
  }
  return best.score >= 4 ? best : { table: null, score: best.score, mapping: {} };
}
