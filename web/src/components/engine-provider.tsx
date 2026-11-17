"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Engine, type IngestInput, type PipelineLog, type Row } from "@/lib/engine";
import { createTaskQueue } from "@/lib/task-queue";
import { assertGarageGeneration, emptyGarage, type GarageState } from "@/lib/garage";
import { documentsCsv, hasFleet, loadWorkspace, persistStorage, saveWorkspace, unlockVault, vaultStatus, vehiclesFromDocuments, type VaultStatus, type Workspace } from "@/lib/workspace";

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
  updateGarage: (update: (state: GarageState) => GarageState) => Promise<void>;
  runMine: () => Promise<void>;
  /** Passphrase protection of the saved fleet: none, locked (sealed, key not entered) or unlocked. */
  vault: VaultStatus;
  /** Enter the passphrase; on success the saved fleet is loaded and built. */
  unlock: (passphrase: string) => Promise<boolean>;
  refreshVault: () => Promise<void>;
}

const Ctx = createContext<EngineState | null>(null);
let shared: Promise<Engine> | null = null;
const queueRun = createTaskQueue();
const getEngine = () => shared ??= Engine.create(BASE).catch((error) => { shared = null; throw error; });

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState<Status>("booting");
  const [message, setMessage] = useState("Starting the SQL engine in your browser…");
  const [log, setLog] = useState<PipelineLog | null>(null);
  const [runId, setRunId] = useState(0);
  const [region, setRegion] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const started = useRef(false);
  const [dataset, setDataset] = useState<Dataset>("demo");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const saveQueue = useRef(createTaskQueue()).current;
  const warehouseGeneration = useRef(0);
  const [vault, setVault] = useState<VaultStatus>("none");

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

  const runDemo = useCallback(() => queueRun(async () => {
    warehouseGeneration.current += 1;
    setDataset("demo");
    setStatus("running");
    try {
      const e = await getEngine();
      setEngine(e);
      setMessage("Loading the demo fleet and running the pipeline…");
      const loads = await e.loadDemo();
      await finish(e, await e.run("Sahra Mobility (demo)", loads));
    } catch (error) {
      setStatus("failed"); setMessage((error as Error).message.split("\n")[0]);
    }
  }), [finish]);

  const runWorkspace = useCallback(
    (ws: Workspace) => queueRun(async () => {
      warehouseGeneration.current += 1;
      setStatus("running");
      try {
        const e = await getEngine();
        setEngine(e);
        setMessage(`Building ${ws.name} from ${ws.inputs.length} sheet(s) and ${ws.documents.filter((d) => d.confirmed).length} document(s)…`);
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
    }),
    [finish],
  );

  const commit = useCallback(
    (ws: Workspace, opts: { rebuild?: boolean } = {}) => saveQueue(async () => {
      const next = { ...ws, garage: workspaceRef.current?.garage ?? ws.garage };
      await saveWorkspace(next);
      workspaceRef.current = next;
      setWorkspace(next);
      persistStorage();
      if ((opts.rebuild ?? true) && hasFleet(next)) await runWorkspace(next);
    }),
    [runWorkspace, saveQueue],
  );
  const updateGarage = useCallback((update: (state: GarageState) => GarageState) => {
    const expected = warehouseGeneration.current;
    return saveQueue(async () => {
    assertGarageGeneration(expected, warehouseGeneration.current);
    const current = workspaceRef.current;
    if (!current) throw new Error("Load and unlock your fleet before saving garage actions.");
    const next = { ...current, garage: update(current.garage ?? emptyGarage()) };
    await saveWorkspace(next);
    workspaceRef.current = next;
    setWorkspace(next);
    });
  }, [saveQueue]);

  const runMine = useCallback(async () => {
    const ws = workspace ?? (await loadWorkspace());
    if (hasFleet(ws)) await runWorkspace(ws!);
  }, [workspace, runWorkspace]);

  const demo = useCallback(async () => {
    await runDemo();
  }, [runDemo]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const v = await vaultStatus();
      setVault(v);
      if (v === "locked") return runDemo();   // sealed fleet: show the demo until the passphrase is entered
      const ws = await loadWorkspace();
      workspaceRef.current = ws;
      setWorkspace(ws);
      if (hasFleet(ws)) await runWorkspace(ws!);
      else await runDemo();
    })().catch((err) => {
      setStatus("failed");
      setMessage(`Engine failed to start: ${(err as Error).message}`);
    });
  }, [runDemo, runWorkspace]);

  const unlock = useCallback(async (passphrase: string) => {
    if (!(await unlockVault(passphrase))) return false;
    setVault(await vaultStatus());
    const ws = await loadWorkspace();
    workspaceRef.current = ws;
    setWorkspace(ws);
    if (hasFleet(ws)) await runWorkspace(ws!);
    return true;
  }, [runWorkspace]);

  const refreshVault = useCallback(async () => setVault(await vaultStatus()), []);

  return (
    <Ctx.Provider value={{ status, message, log, runId, engine, region, setRegion, regions, runDemo: demo, dataset, workspace, commit, updateGarage, runMine, vault, unlock, refreshVault }}>
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
  return status === "ready" && state.key === key ? state : { data: null, error: null, key };
}

/** SQL fragment for the global region filter. */
export function regionWhere(region: string | null, prefix: "WHERE" | "AND" = "WHERE", col = "region") {
  return region ? ` ${prefix} ${col} = '${region.replace(/'/g, "''")}'` : "";
}


