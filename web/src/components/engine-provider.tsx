"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Engine, type IngestInput, type PipelineLog, type Row } from "@/lib/engine";
import { createTaskQueue } from "@/lib/task-queue";
import { isBodyStyle, type BodyStyle } from "@/lib/car-styles";
import { assertGarageGeneration, emptyGarage, type GarageState } from "@/lib/garage";
import { isActivityEntry, withActivity, clearLegacySopNotes, documentsCsv, hasFleet, loadWorkspace, persistStorage, saveWorkspace, takeLegacySopNotes, unlockVault, vaultStatus, vehiclesFromDocuments, type SopProgress, type VaultStatus, type Workspace } from "@/lib/workspace";

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
  /** Save one procedure's review progress into the (encrypted) workspace. */
  updateSop: (key: string, progress: SopProgress) => Promise<void>;
  updateCarStyle: (key: string, style: BodyStyle | null) => Promise<void>;
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
/** Load the saved workspace and fold in procedure notes that older versions left in plain localStorage. */
async function loadAndMigrate(): Promise<Workspace | null> {
  const loaded = await loadWorkspace();
  if (!loaded) return loaded;
  // keep only recognised car shapes; anything else in stored data is ignored
  const ws = { ...loaded, activity: Array.isArray(loaded.activity) ? loaded.activity.filter(isActivityEntry).slice(-400) : [], carStyles: Object.fromEntries(Object.entries(loaded.carStyles ?? {}).filter(([k, v]) => typeof k === "string" && isBodyStyle(v))) as Record<string, BodyStyle> };
  const legacy = takeLegacySopNotes();
  if (!Object.keys(legacy).length) { clearLegacySopNotes(); return ws; }
  const next = { ...ws, sops: { ...legacy, ...ws.sops } };
  await saveWorkspace(next);
  clearLegacySopNotes();
  return next;
}
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
      const prev = workspaceRef.current;
      const base = { ...ws, garage: prev?.garage ?? ws.garage, sops: prev?.sops ?? ws.sops, carStyles: prev?.carStyles ?? ws.carStyles, activity: prev?.activity ?? ws.activity };
      const files = ws.inputs.length, docs = ws.documents.length;
      const next = withActivity(base, "data", `Fleet data saved: ${files} sheet${files === 1 ? "" : "s"}, ${docs} document${docs === 1 ? "" : "s"}`);
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
    const before = current.garage ?? emptyGarage(), after = update(before);
    const detail = after.handovers.length > before.handovers.length ? `Handover recorded for ${after.handovers.at(-1)!.vehicleId}`
      : after.incidents.length > before.incidents.length ? `Accident reported for ${after.incidents.at(-1)!.vehicleId}`
      : after.acknowledged.length > before.acknowledged.length ? `${after.acknowledged.length - before.acknowledged.length} alert(s) marked read`
      : "Garage review updated";
    const next = withActivity({ ...current, garage: after }, "garage", detail);
    await saveWorkspace(next);
    workspaceRef.current = next;
    setWorkspace(next);
    });
  }, [saveQueue]);
  const updateSop = useCallback((key: string, progress: SopProgress) => saveQueue(async () => {
    const current = workspaceRef.current;
    if (!current) throw new Error("Load and unlock your fleet before saving procedure notes.");
    const next = withActivity({ ...current, sops: { ...current.sops, [key]: progress } }, "procedure", `Procedure ${key.split(":").at(-1)} updated (${progress.checked.length} steps checked)`);
    await saveWorkspace(next);
    workspaceRef.current = next;
    setWorkspace(next);
  }), [saveQueue]);

  const updateCarStyle = useCallback((key: string, style: BodyStyle | null) => saveQueue(async () => {
    const current = workspaceRef.current;
    if (!current) throw new Error("Load and unlock your fleet before saving car shapes.");
    const carStyles = { ...current.carStyles };
    if (style && isBodyStyle(style)) carStyles[key] = style; else delete carStyles[key];
    const next = withActivity({ ...current, carStyles }, "settings", `Car shape for ${key.replace("|", " ").trim() || "a model"} set to ${style ?? "auto"}`);
    await saveWorkspace(next);
    workspaceRef.current = next;
    setWorkspace(next);
  }), [saveQueue]);

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
      const ws = await loadAndMigrate();
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
    const ws = await loadAndMigrate();
    workspaceRef.current = ws;
    setWorkspace(ws);
    if (hasFleet(ws)) await runWorkspace(ws!);
    return true;
  }, [runWorkspace]);

  const refreshVault = useCallback(async () => setVault(await vaultStatus()), []);

  return (
    <Ctx.Provider value={{ status, message, log, runId, engine, region, setRegion, regions, runDemo: demo, dataset, workspace, commit, updateGarage, updateSop, updateCarStyle, runMine, vault, unlock, refreshVault }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEngine outside EngineProvider");
  return c;
}

/** Queries that failed in the current run, so loading placeholders can turn into an error state instead of waiting
 *  for ever (docs/DESIGN_PRINCIPLES.md §7). Keyed by run and SQL; a later success for the same key clears it. */
const failures = new Map<string, string>();
const failureListeners = new Set<() => void>();
const setFailure = (key: string, message: string | null) => {
  if (message === null ? !failures.delete(key) : failures.get(key) === message) return;
  if (message !== null) failures.set(key, message);
  failureListeners.forEach((l) => l());
};
/** The first query error in the current run, or null. */
export function useQueryFailure(): string | null {
  const { runId } = useEngine();
  return useSyncExternalStore(
    (l) => { failureListeners.add(l); return () => { failureListeners.delete(l); }; },
    () => { for (const [k, m] of failures) if (k.startsWith(runId + ":")) return m; return null; },
    () => null,
  );
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
      .then((data) => { setFailure(key, null); if (live) setState({ data, error: null, key }); })
      .catch((e: Error) => { const msg = e.message.split("\n")[0]; setFailure(key, msg); if (live) setState({ data: null, error: msg, key }); });
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


