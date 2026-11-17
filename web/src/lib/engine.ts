/**
 * The fleetkpi pipeline, in the browser. Runs the exact SQL that `fleetkpi build` runs
 * (exported by `fleetkpi web-export` into public/engine/manifest.json) inside DuckDB-WASM:
 *   Ingest → Settings → Macros → Validate → Staging → Intermediate → Marts → Test
 * Data never leaves the browser.
 */
import * as duckdb from "@duckdb/duckdb-wasm";

export type Row = Record<string, unknown>;

interface ColumnSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
  synonyms: string[];
  expr: string;
  empty_expr: string;
}
interface TableSpec {
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
}
export interface PipelineLog {
  ok: boolean;
  dataset: string;
  snapshot: string;
  stages: StageLog[];
  models: ModelLog[];
  tests: TestLog[];
  issues: IssueLog[];
  loads: LoadLog[];
  totalMs: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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
    const worker = new Worker(`${base}/duckdb/duckdb-browser-eh.worker.js`);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(`${base}/duckdb/duckdb-eh.wasm`);
    const conn = await db.connect();
    const manifest = (await (await fetch(`${base}/engine/manifest.json`)).json()) as Manifest;
    return new Engine(db, conn, manifest, base);
  }

  async query<T = Row>(sql: string): Promise<T[]> {
    return toRows(await this.conn.query(sql)) as T[];
  }

  private async exec(sql: string) {
    await this.conn.query(sql);
  }

  /** The demo fleet: standardised parquet files, loaded as-is. */
  async loadDemo(): Promise<LoadLog[]> {
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

  /** Anyone's files (CSV / Parquet / JSON), mapped to the data contract by column synonyms. */
  async loadFiles(files: File[]): Promise<LoadLog[]> {
    const byTable = new Map<string, File>();
    for (const f of files) byTable.set(norm(f.name.replace(/\.[^.]+$/, "")), f);
    const loads: LoadLog[] = [];
    for (const t of this.manifest.tables) {
      const file = byTable.get(t.name);
      const log: LoadLog = { table: t.name, source: file?.name ?? null, rows: 0, mapped: {}, missingRequired: [] };
      if (!file) {
        const cols = t.columns.map((c) => `CAST(NULL AS ${c.type}) AS ${c.name}`).join(", ");
        await this.exec(`CREATE OR REPLACE TABLE ${t.name} AS SELECT ${cols} WHERE FALSE`);
        if (t.required) log.missingRequired = t.columns.filter((c) => c.required).map((c) => c.name);
        loads.push(log);
        continue;
      }
      const vname = `upload_${t.name}${file.name.slice(file.name.lastIndexOf("."))}`;
      await this.db.registerFileBuffer(vname, new Uint8Array(await file.arrayBuffer()));
      const ext = file.name.toLowerCase().split(".").pop();
      const reader =
        ext === "parquet" ? `SELECT COLUMNS(*)::VARCHAR FROM read_parquet(${lit(vname)})`
        : ext === "json" ? `SELECT COLUMNS(*)::VARCHAR FROM read_json_auto(${lit(vname)})`
        : `SELECT * FROM read_csv(${lit(vname)}, all_varchar = true, header = true, auto_detect = true)`;
      await this.exec(`CREATE OR REPLACE TEMP TABLE raw_${t.name} AS ${reader}`);
      const srcCols = (await this.query<{ column_name: string }>(`DESCRIBE raw_${t.name}`)).map((r) => r.column_name);
      const byNorm = new Map(srcCols.map((s) => [norm(s), s]));
      const used = new Set<string>();
      const select = t.columns.map((c) => {
        const src = c.synonyms.map((s) => byNorm.get(norm(s))).find((s) => s && !used.has(s));
        if (!src) {
          if (c.required && t.required) log.missingRequired.push(c.name);
          if (t.name === "vehicles" && c.name === "fuel_type" && log.mapped.powertrain)
            return `CASE WHEN regexp_matches(lower(${qid(log.mapped.powertrain)}::VARCHAR), 'diesel') THEN 'diesel' END AS fuel_type`;
          return `${c.empty_expr} AS ${c.name}`;
        }
        used.add(src);
        log.mapped[c.name] = src;
        return `${c.expr.replaceAll("{src}", `${qid(src)}::VARCHAR`)} AS ${c.name}`;
      });
      await this.exec(`CREATE OR REPLACE TABLE ${t.name} AS SELECT ${select.join(", ")} FROM raw_${t.name}`);
      log.rows = (await this.query<{ n: number }>(`SELECT count(*) AS n FROM ${t.name}`))[0].n;
      loads.push(log);
    }
    for (const sql of this.manifest.post_ingest) await this.exec(sql);
    return loads;
  }

  /** Stages 2-8 on whatever is loaded. */
  async run(dataset: string, loads: LoadLog[]): Promise<PipelineLog> {
    const m = this.manifest;
    const t0 = now();
    const log: PipelineLog = {
      ok: false, dataset, snapshot: "", stages: [], models: [], tests: [], issues: [], loads, totalMs: 0,
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
      return ["ok", `${found} of ${loads.length} tables, ${rows.toLocaleString()} rows`];
    });
    if (!ingestOk) return this.finish(log, t0);

    if (!(await stage("Settings", async () => {
      const [snap] = await this.query<{ snapshot_ts: string; analysis_start: string }>(m.snapshot_sql);
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
