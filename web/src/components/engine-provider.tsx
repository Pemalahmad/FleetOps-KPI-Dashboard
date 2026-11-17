"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Engine, type IngestInput, type PipelineLog, type Row } from "@/lib/engine";
import { documentsCsv, hasFleet, loadWorkspace, persistStorage, saveWorkspace, vehiclesFromDocuments, type Workspace } from "@/lib/workspace";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Status = "booting" | "running" | "ready" | "failed";
export type Dataset = "demo" | "mine";

interface EngineState {
  status: Status;
  message: string;
  log: PipelineLog | null;
  runId: number;
  engine: Engine | null;
  region: string | null;
  setRegion: (r: string | null) => void;
  regions: string[];
  runDemo: () => Promise<void>;
  /** The owner's fleet, saved in this browser. */
  dataset: Dataset;
  workspace: Workspace | null;
  /** Save a changed workspace and rebuild the warehouse from it. */
  commit: (ws: Workspace, opts?: { rebuild?: boolean }) => Promise<void>;
  runMine: () => Promise<void>;
}

const Ctx = createContext<EngineState | null>(null);
let shared: Promise<Engine> | null = null;

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState<Status>("booting");
  const [message, setMessage] = useState("Starting the SQL engine in your browser…");
  const [log, setLog] = useState<PipelineLog | null>(null);
  const [runId, setRunId] = useState(0);
  const [region, setRegion] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const started = useRef(false);

  const finish = useCallback(async (e: Engine, l: PipelineLog) => {
    setLog(l);
    if (l.ok) {
      const rs = await e.query<{ region: string }>("SELECT DISTINCT region FROM mart_fleet_registry WHERE region IS NOT NULL ORDER BY 1");
      setRegions(rs.map((r) => r.region));
      setRegion(null);
      setStatus("ready");
      setMessage(`${l.dataset}: ${l.models.length} SQL models and ${l.tests.length} tests ran in ${(l.totalMs / 1000).toFixed(1)} s`);
    } else {
      setStatus("failed");
      const bad = l.stages.find((s) => s.status === "failed" || s.status === "blocked");
      setMessage(bad ? `${bad.name}: ${bad.detail}` : "Pipeline did not finish");
    }
    setRunId((n) => n + 1);
  }, []);

  const runDemo = useCallback(async () => {
    const e = await (shared ??= Engine.create(BASE));
    setEngine(e);
    setStatus("running");
    setMessage("Loading the demo fleet and running the pipeline…");
    const loads = await e.loadDemo();
    await finish(e, await e.run("Sahra Mobility (demo)", loads));
  }, [finish]);

  const [dataset, setDataset] = useState<Dataset>("demo");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const runWorkspace = useCallback(
    async (ws: Workspace) => {
      const e = await (shared ??= Engine.create(BASE));
      setEngine(e);
      setStatus("running");
      setMessage(`Building ${ws.name} from ${ws.inputs.length} sheet(s) and ${ws.documents.filter((d) => d.confirmed).length} document(s)…`);
      try {
        const inputs: IngestInput[] = ws.inputs.map((i) => ({ table: i.table, label: i.label, kind: i.kind, csv: i.csv, bytes: i.bytes, mapping: i.mapping }));
        const fromCards = vehiclesFromDocuments(ws.documents);
        if (fromCards) inputs.push({ table: "vehicles", label: "Vehicles added from documents", kind: "tabular", csv: fromCards,
          mapping: { vehicle_id: "vehicle_id", plate_number: "plate_number", vin: "vin" } });
        const loads = await e.ingest(inputs, { documentsCsv: documentsCsv(ws.documents), vinSpecs: Object.values(ws.vinSpecs) });
        setDataset("mine");
        await finish(e, await e.run(ws.name, loads));
      } catch (err) {
        setStatus("failed");
        setMessage((err as Error).message.split("\n")[0]);
      }
    },
    [finish],
  );

  const commit = useCallback(
    async (ws: Workspace, opts: { rebuild?: boolean } = {}) => {
      setWorkspace(ws);
      await saveWorkspace(ws);
      persistStorage();
      if ((opts.rebuild ?? true) && hasFleet(ws)) await runWorkspace(ws);
    },
    [runWorkspace],
  );

  const runMine = useCallback(async () => {
    const ws = workspace ?? (await loadWorkspace());
    if (hasFleet(ws)) await runWorkspace(ws!);
  }, [workspace, runWorkspace]);

  const demo = useCallback(async () => {
    setDataset("demo");
    await runDemo();
  }, [runDemo]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const ws = await loadWorkspace();
      setWorkspace(ws);
      if (hasFleet(ws)) await runWorkspace(ws!);
      else await runDemo();
    })().catch((err) => {
      setStatus("failed");
      setMessage(`Engine failed to start: ${(err as Error).message}`);
    });
  }, [runDemo, runWorkspace]);

  return (
    <Ctx.Provider value={{ status, message, log, runId, engine, region, setRegion, regions, runDemo: demo, dataset, workspace, commit, runMine }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEngine outside EngineProvider");
  return c;
}

/** Run SQL against the warehouse; re-runs when the pipeline re-runs or the SQL changes. */
export function useSql<T = Row>(sql: string | null) {
  const { engine, status, runId } = useEngine();
  const [state, setState] = useState<{ data: T[] | null; error: string | null; key: string }>({ data: null, error: null, key: "" });
  const key = `${runId}:${sql}`;
  useEffect(() => {
    if (!engine || status !== "ready" || !sql) return;
    let live = true;
    engine
      .query<T>(sql)
      .then((data) => live && setState({ data, error: null, key }))
      .catch((e: Error) => live && setState({ data: null, error: e.message.split("\n")[0], key }));
    return () => {
      live = false;
    };
  }, [engine, status, sql, key]);
  return state.key === key ? state : { data: null, error: null, key };
}

/** SQL fragment for the global region filter. */
export function regionWhere(region: string | null, prefix: "WHERE" | "AND" = "WHERE", col = "region") {
  return region ? ` ${prefix} ${col} = '${region.replace(/'/g, "''")}'` : "";
}
