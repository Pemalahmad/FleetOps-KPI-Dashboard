/**
 * The fleetkpi pipeline, in the browser. Runs the exact SQL that `fleetkpi build` runs
 * (exported by `fleetkpi web-export` into public/engine/manifest.json) inside DuckDB-WASM:
 *   Ingest → Settings → Macros → Validate → Staging → Intermediate → Marts → Test
 * Data never leaves the browser.
 */
import * as duckdb from "@duckdb/duckdb-wasm";
import type { VinSpec } from "./vin";
import { engineManifestUrl } from "./engine-manifest-url.mjs";

export type Row = Record<string, unknown>;

interface ColumnSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
  synonyms: string[];
  expr: string;
  empty_expr: string;
  shared?: boolean;
  example?: string;
}
export interface TableSpec {
  name: string;
  required: boolean;
  description: string;
  columns: ColumnSpec[];
}
interface SqlSpec {
  name: string;
  description: string;
  sql: string;
}
export interface ModelSpec extends SqlSpec {
  layer: "staging" | "intermediate" | "marts";
  materialized: "view" | "table";
  deps: string[];
  sources: string[];
}
export interface Manifest {
  version: string;
  tables: TableSpec[];
  post_ingest: string[];
  snapshot_sql: string;
  settings_sql: string[];
  macros: string[];
  validation: (SqlSpec & { table: string; severity: string; needs: string[] })[];
  models: ModelSpec[];
  tests: (SqlSpec & { severity: string })[];
}

export interface IngestInput {
  table: string;
  label: string;
  kind: "tabular" | "parquet" | "json";
  csv?: string;
  bytes?: Uint8Array;
  mapping: Record<string, string | null>;
}
export type VinSpecRow = Pick<VinSpec, "vin" | "make" | "model" | "model_year" | "trim" | "configuration" | "powertrain" | "fuel_type">;

export interface StageLog {
  name: string;
  status: "ok" | "warn" | "failed" | "blocked";
  detail: string;
  ms: number;
}
export interface ModelLog {
  name: string;
  layer: string;
  materialized: string;
  description: string;
  rows: number;
  ms: number;
  deps: string[];
  sources: string[];
}
export interface TestLog {
  name: string;
  description: string;
  severity: string;
  failing: number;
  status: "pass" | "fail" | "warn" | "error";
  ms: number;
}
export interface IssueLog {
  rule: string;
  table: string;
  severity: string;
  check: string;
  count: number;
  example: string;
}
export interface LoadLog {
  table: string;
  source: string | null;
  rows: number;
  mapped: Record<string, string>;
  missingRequired: string[];
  /** Non-blank source values that are not a valid value of the column's type (they would load as NULL). */
  unparsed?: Record<string, number>;
  /** Rows whose required column is blank. */
  blankRequired?: Record<string, number>;
  /** Required columns of this table (once it is supplied, an optional table's required columns still apply). */
  required?: string[];
}
export interface PipelineLog {
  ok: boolean;
  dataset: string;
  mode: "operations" | "registry";
  snapshot: string;
  stages: StageLog[];
  models: ModelLog[];
  tests: TestLog[];
  issues: IssueLog[];
  loads: LoadLog[];
  totalMs: number;
}

const qid = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = () => performance.now();

type ArrowTable = Awaited<ReturnType<duckdb.AsyncDuckDBConnection["query"]>>;
// Arrow type ids (stable across Arrow versions): Decimal 7, Date 8, Timestamp 10.
const T_DECIMAL = 7, T_DATE = 8, T_TIMESTAMP = 10;

/** Arrow → plain JS rows: BigInt → number, dates and timestamps → ISO strings. */
function toRows(table: ArrowTable): Row[] {
  const fields = table.schema.fields;
  const out: Row[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const r: Row = {};
    for (let c = 0; c < fields.length; c++) {
      const f = fields[c];
      let v = table.getChildAt(c)?.get(i) as unknown;
      if (v === null || v === undefined) v = null;
      else if (typeof v === "bigint") v = Number(v);
      else if (f.type.typeId === T_DATE || f.type.typeId === T_TIMESTAMP) {
        const d = v instanceof Date ? v : new Date(Number(v));
        v = f.type.typeId === T_DATE ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 19);
      } else if (f.type.typeId === T_DECIMAL) v = Number(String(v)) / 10 ** ((f.type as unknown as { scale: number }).scale ?? 0);
      else if (typeof v === "object" && v !== null && "toJSON" in v) v = (v as { toJSON: () => unknown }).toJSON();
      r[f.name] = v;
    }
    out.push(r);
  }
  return out;
}

export class Engine {
  private constructor(
    private db: duckdb.AsyncDuckDB,
    private conn: duckdb.AsyncDuckDBConnection,
    readonly manifest: Manifest,
    private base: string,
  ) {}

  static async create(base: string): Promise<Engine> {
    const abs = (p: string) => new URL(`${base}${p}`, location.href).href;
    // Start the worker from a blob: a blob worker inherits this page's Content Security Policy, so the engine can only
    // reach this site (a worker loaded straight from a URL would get no policy on GitHub Pages, which sends no headers).
    const boot = URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(abs("/duckdb/duckdb-browser-eh.worker.js"))});`],
      { type: "text/javascript" }));
    const worker = new Worker(boot);
    URL.revokeObjectURL(boot);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    try {
      await db.instantiate(abs("/duckdb/duckdb-eh.wasm"));
      const conn = await db.connect();
      // extensions (parquet, json) come from this site's verified copy, never from extensions.duckdb.org
      await conn.query(`SET custom_extension_repository = '${abs("/duckdb/extensions").replace(/'/g, "''")}'`);
      const response = await fetch(engineManifestUrl(base, process.env.NEXT_PUBLIC_FLEETOPS_ENGINE_REVISION));
      if (!response.ok) throw new Error(`SQL engine manifest unavailable (${response.status})`);
      const manifest = (await response.json()) as Manifest;
      return new Engine(db, conn, manifest, base);
    } catch (error) {
      await db.terminate().catch(() => worker.terminate());
      throw error;
    }
  }

  async query<T = Row>(sql: string): Promise<T[]> {
    return toRows(await this.conn.query(sql)) as T[];
  }

  private async exec(sql: string) {
    await this.conn.query(sql);
  }

  /** The demo fleet: standardised parquet files, loaded as-is. */
  async loadDemo(): Promise<LoadLog[]> {
    this.mode = "operations";
    const loads: LoadLog[] = [];
    await Promise.all(
      this.manifest.tables.map(async (t) => {
        const buf = new Uint8Array(await (await fetch(`${this.base}/demo/${t.name}.parquet`)).arrayBuffer());
        await this.db.registerFileBuffer(`${t.name}.parquet`, buf);
      }),
    );
    for (const t of this.manifest.tables) {
      await this.exec(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM read_parquet('${t.name}.parquet')`);
      const [{ n }] = await this.query<{ n: number }>(`SELECT count(*) AS n FROM ${t.name}`);
      loads.push({ table: t.name, source: `${t.name}.parquet`, rows: n, mapped: {}, missingRequired: [] });
    }
    return loads;
  }

  /**
   * Anyone's data, as mapped in the import wizard. Several sheets may feed one table (they are stacked).
   * A mapping value is a source header, "=text" for a constant on every row, or null for "not supplied".
   * Without work orders the fleet runs in registry mode: only the vehicle list is required.
   */
  async ingest(inputs: IngestInput[], extra: { documentsCsv?: string | null; vinSpecs?: VinSpecRow[] } = {}): Promise<LoadLog[]> {
    const all = [...inputs];
    if (extra.documentsCsv) {
      const docs = this.manifest.tables.find((t) => t.name === "documents")!;
      const header = extra.documentsCsv.split("\n", 1)[0].split(",");
      all.push({ table: "documents", label: "Document vault", kind: "tabular", csv: extra.documentsCsv,
        mapping: Object.fromEntries(docs.columns.map((c) => [c.name, header.includes(c.name) ? c.name : null])) });
    }
    const registry = !all.some((i) => i.table === "work_orders");
    const loads: LoadLog[] = [];
    let n = 0;
    for (const t of this.manifest.tables) {
      const mine = all.filter((i) => i.table === t.name);
      const log: LoadLog = { table: t.name, source: mine.map((i) => i.label).join(" + ") || null, rows: 0, mapped: {}, missingRequired: [], unparsed: {}, blankRequired: {} };
      // Same contract as fleetkpi/validate.py. "Optional" means the table may be absent; once supplied, its required
      // columns apply. Registry mode (no work orders yet) asks only for vehicle ids from the vehicle list.
      const contract = t.columns.filter((c) => c.required).map((c) => c.name);
      const required = mine.length ? (registry && t.name === "vehicles" ? ["vehicle_id"] : contract)
        : registry ? (t.name === "vehicles" ? ["vehicle_id"] : []) : t.required ? contract : [];
      log.required = required;
      if (!mine.length) {
        const cols = t.columns.map((c) => `CAST(NULL AS ${c.type}) AS ${c.name}`).join(", ");
        await this.exec(`CREATE OR REPLACE TABLE ${t.name} AS SELECT ${cols} WHERE FALSE`);
        if (required.length) log.missingRequired = required;
        loads.push(log);
        continue;
      }
      const selects: string[] = [];
      for (const inp of mine) {
        const raw = `raw_${t.name}_${n++}`;
        const fname = `${raw}.${inp.kind === "tabular" ? "csv" : inp.kind}`;
        await this.db.registerFileBuffer(fname, inp.kind === "tabular" ? new TextEncoder().encode(inp.csv ?? "") : inp.bytes!);
        const reader =
          inp.kind === "parquet" ? `SELECT COLUMNS(*)::VARCHAR FROM read_parquet(${lit(fname)})`
          : inp.kind === "json" ? `SELECT COLUMNS(*)::VARCHAR FROM read_json_auto(${lit(fname)})`
          : `SELECT * FROM read_csv(${lit(fname)}, all_varchar = true, header = true, auto_detect = true, quote = '"', escape = '"')`;
        await this.exec(`CREATE OR REPLACE TEMP TABLE ${raw} AS ${reader}`);
        const sheetNo = n;
        const cols = t.columns.map((c) => {
          const m = inp.mapping[c.name];
          // automatic ids (documents without one) are numbered per sheet, so two sheets never collide
          if (!m && t.name === "documents" && c.name === "document_id")
            return `${c.empty_expr.replace("'DOC-'", `'DOC-${sheetNo}-'`)} AS ${c.name}`;
          if (m && m.startsWith("=")) return `${c.expr.replaceAll("{src}", lit(m.slice(1)))} AS ${c.name}`;
          if (m) {
            log.mapped[c.name] = m;
            return `${c.expr.replaceAll("{src}", `${qid(m)}::VARCHAR`)} AS ${c.name}`;
          }
          if (t.name === "vehicles" && c.name === "fuel_type" && inp.mapping.powertrain && !inp.mapping.powertrain.startsWith("="))
            return `CASE WHEN regexp_matches(lower(${qid(inp.mapping.powertrain)}::VARCHAR), 'diesel') THEN 'diesel' END AS fuel_type`;
          return `${c.empty_expr} AS ${c.name}`;
        });
        selects.push(`SELECT ${cols.join(", ")} FROM ${raw}`);
        // Count what a mapped column would silently lose: values that fail conversion, and blank required cells.
        const values: string[] = [], checks: string[] = [], keys: [string, "u" | "b", string][] = [];
        t.columns.forEach((c, k) => {
          const m = inp.mapping[c.name];
          if (!m) return;
          const src = m.startsWith("=") ? lit(m.slice(1)) : `${qid(m)}::VARCHAR`;
          values.push(`${src} AS source_${k}`, `${c.expr.replaceAll("{src}", src)} AS parsed_${k}`);
          checks.push(`count(*) FILTER (WHERE nullif(trim(source_${k}), '') IS NOT NULL AND parsed_${k} IS NULL) AS u${k}`);
          keys.push([`u${k}`, "u", c.name]);
          if (required.includes(c.name)) { checks.push(`count(*) FILTER (WHERE nullif(trim(source_${k}), '') IS NULL) AS b${k}`); keys.push([`b${k}`, "b", c.name]); }
        });
        if (checks.length) {
          // Resolve row_number() defaults for generated IDs before aggregating diagnostics.
          const [counts] = await this.query<Record<string, number | bigint>>(
            `SELECT ${checks.join(", ")} FROM (SELECT ${values.join(", ")} FROM ${raw})`);
          for (const [key, kind, col] of keys) {
            const found = Number(counts[key] ?? 0);
            if (!found) continue;
            const bucket = kind === "u" ? log.unparsed! : log.blankRequired!;
            bucket[col] = (bucket[col] ?? 0) + found;
          }
        }
      }
      log.missingRequired = required.filter((c) => !mine.some((i) => i.mapping[c]));
      await this.exec(`CREATE OR REPLACE TABLE ${t.name} AS ${selects.join(" UNION ALL ")}`);
      log.rows = (await this.query<{ n: number }>(`SELECT count(*) AS n FROM ${t.name}`))[0].n;
      loads.push(log);
    }
    for (const sql of this.manifest.post_ingest) await this.exec(sql);
    if (extra.vinSpecs?.length) await this.applyVinSpecs(extra.vinSpecs);
    this.mode = registry ? "registry" : "operations";
    return loads;
  }

  /** Fill blanks in the vehicle list from decoded VINs (never overwrite what the owner supplied). */
  private async applyVinSpecs(specs: VinSpecRow[]) {
    const v = (x: string | number | null) => (x === null || x === undefined ? "NULL" : typeof x === "number" ? String(x) : lit(x));
    const rows = specs.map((s) => `(${[s.vin, s.make, s.model, s.model_year, s.trim, s.configuration, s.powertrain, s.fuel_type].map(v).join(", ")})`);
    await this.exec(`CREATE OR REPLACE TEMP TABLE vin_spec AS SELECT * FROM (VALUES ${rows.join(", ")})
                     AS t(vin, make, model, model_year, trim, configuration, powertrain, fuel_type)`);
    await this.exec(`UPDATE vehicles SET make = coalesce(vehicles.make, s.make), model = coalesce(vehicles.model, s.model),
                       model_year = coalesce(vehicles.model_year, s.model_year::INTEGER), trim = coalesce(vehicles.trim, s.trim),
                       configuration = coalesce(vehicles.configuration, s.configuration),
                       powertrain = coalesce(vehicles.powertrain, s.powertrain), fuel_type = coalesce(vehicles.fuel_type, s.fuel_type)
                     FROM vin_spec s WHERE vehicles.vin = s.vin`);
  }

  private mode: "operations" | "registry" = "operations";

  /** Stages 2-8 on whatever is loaded. */
  async run(dataset: string, loads: LoadLog[]): Promise<PipelineLog> {
    const m = this.manifest;
    const t0 = now();
    const log: PipelineLog = {
      ok: false, dataset, mode: this.mode, snapshot: "", stages: [], models: [], tests: [], issues: [], loads, totalMs: 0,
    };
    const stage = async (name: string, fn: () => Promise<[StageLog["status"], string]>) => {
      const s0 = now();
      let status: StageLog["status"], detail: string;
      try {
        [status, detail] = await fn();
      } catch (e) {
        status = "failed";
        detail = (e as Error).message.split("\n")[0];
      }
      log.stages.push({ name, status, detail, ms: now() - s0 });
      return status !== "failed" && status !== "blocked";
    };

    const missing = loads.filter((l) => l.missingRequired.length);
    const ingestOk = await stage("Ingest", async () => {
      const rows = loads.reduce((s, l) => s + l.rows, 0);
      const found = loads.filter((l) => l.source).length;
      if (missing.length)
        return ["blocked", `missing required: ${missing.map((l) => `${l.table} (${l.missingRequired.join(", ")})`).join("; ")}`];
      const bad: string[] = [];
      for (const l of loads) {
        for (const [col, n] of Object.entries(l.unparsed ?? {})) {
          const hard = !!l.required?.includes(col);
          log.issues.push({ rule: "ingest_unparsed", table: l.table, severity: hard ? "error" : "warning", check: `'${col}' values that are not valid for this column`, count: n, example: "" });
          if (hard) bad.push(`${l.table}.${col}: ${n} invalid`);
        }
        for (const [col, n] of Object.entries(l.blankRequired ?? {})) {
          log.issues.push({ rule: "ingest_blank_required", table: l.table, severity: "error", check: `Required '${col}' is blank`, count: n, example: "" });
          bad.push(`${l.table}.${col}: ${n} blank`);
        }
      }
      if (bad.length) return ["blocked", `required values missing or invalid: ${bad.join("; ")}`];
      return ["ok", `${found} of ${loads.length} tables, ${rows.toLocaleString()} rows${this.mode === "registry" ? " · registry mode (no work orders yet)" : ""}`];
    });
    if (!ingestOk) return this.finish(log, t0);

    if (!(await stage("Settings", async () => {
      const [snap] = await this.query<{ snapshot_ts: string | null; analysis_start: string | null }>(m.snapshot_sql);
      // A register without work orders or usage has no activity dates: measure it as of today.
      const today = new Date().toISOString().slice(0, 10);
      snap.snapshot_ts ??= `${today} 00:00:00`;
      snap.analysis_start ??= `${today.slice(0, 7)}-01`;
      log.snapshot = snap.snapshot_ts;
      for (const sql of m.settings_sql)
        await this.exec(sql.replaceAll("{{snapshot_ts}}", snap.snapshot_ts).replaceAll("{{analysis_start}}", snap.analysis_start));
      for (const sql of m.macros) await this.exec(sql);
      return ["ok", `snapshot ${snap.snapshot_ts.slice(0, 10)}, ${m.macros.length} macro files`];
    }))) return this.finish(log, t0);

    const loaded = new Set(loads.filter((l) => l.source).map((l) => l.table));
    if (!(await stage("Validate", async () => {
      for (const v of m.validation) {
        if (v.needs.some((t) => !loaded.has(t))) continue;
        const rows = await this.query(v.sql);
        if (rows.length)
          log.issues.push({
            rule: v.name, table: v.table, severity: v.severity, check: v.description, count: rows.length,
            example: rows.slice(0, 3).map((r) => String(Object.values(r)[0])).join(", "),
          });
      }
      const errors = log.issues.filter((i) => i.severity === "error");
      if (errors.length) return ["blocked", `${errors.length} rules failed: ${errors.map((e) => e.rule).join(", ")}`];
      return [log.issues.length ? "warn" : "ok", `${m.validation.length} rules, ${log.issues.length} warnings`];
    }))) return this.finish(log, t0);

    for (const layer of ["staging", "intermediate", "marts"] as const) {
      const ok = await stage(layer[0].toUpperCase() + layer.slice(1), async () => {
        const ms = m.models.filter((x) => x.layer === layer);
        let rows = 0;
        for (const x of ms) {
          const s0 = now();
          try {
            await this.exec(`CREATE OR REPLACE ${x.materialized === "table" ? "TABLE" : "VIEW"} ${x.name} AS\n${x.sql}`);
          } catch (e) {
            throw new Error(`model ${x.name} (${layer}): ${(e as Error).message.split("\n")[0]}`);
          }
          const [{ n }] = await this.query<{ n: number }>(`SELECT count(*) AS n FROM ${x.name}`);
          rows += n;
          log.models.push({
            name: x.name, layer, materialized: x.materialized, description: x.description, rows: n,
            ms: now() - s0, deps: x.deps, sources: x.sources,
          });
        }
        return ["ok", `${ms.length} models, ${rows.toLocaleString()} rows`];
      });
      if (!ok) return this.finish(log, t0);
    }

    await stage("Test", async () => {
      for (const t of m.tests) {
        const s0 = now();
        let failing = -1, status: TestLog["status"];
        try {
          failing = (await this.query<{ n: number }>(`SELECT count(*) AS n FROM (${t.sql})`))[0].n;
          status = failing === 0 ? "pass" : t.severity === "error" ? "fail" : "warn";
        } catch {
          status = "error";
        }
        log.tests.push({ name: t.name, description: t.description, severity: t.severity, failing, status, ms: now() - s0 });
      }
      const bad = log.tests.filter((t) => t.status === "fail" || t.status === "error");
      const passed = log.tests.filter((t) => t.status === "pass").length;
      return [bad.length ? "failed" : "ok", `${passed}/${log.tests.length} SQL tests passed`];
    });
    return this.finish(log, t0);
  }

  private finish(log: PipelineLog, t0: number): PipelineLog {
    log.totalMs = now() - t0;
    log.ok = log.stages.at(-1)?.name === "Test" && log.stages.every((s) => s.status === "ok" || s.status === "warn");
    return log;
  }
}

