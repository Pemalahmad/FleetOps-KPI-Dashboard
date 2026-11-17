"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Engine, type PipelineLog, type Row } from "@/lib/engine";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Status = "booting" | "running" | "ready" | "failed";

interface EngineState {
  status: Status;
  message: string;
  log: PipelineLog | null;
  runId: number;
  engine: Engine | null;
  region: string | null;
  setRegion: (r: string | null) => void;
  regions: string[];
  runFiles: (files: File[]) => Promise<void>;
  runDemo: () => Promise<void>;
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
      const rs = await e.query<{ region: string }>("SELECT DISTINCT region FROM mart_metric_panel ORDER BY 1");
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

  const runFiles = useCallback(
    async (files: File[]) => {
      const e = await (shared ??= Engine.create(BASE));
      setStatus("running");
      setMessage(`Reading ${files.length} file(s) and running the pipeline…`);
      try {
        const loads = await e.loadFiles(files);
        await finish(e, await e.run("Your fleet", loads));
      } catch (err) {
        setStatus("failed");
        setMessage((err as Error).message.split("\n")[0]);
      }
    },
    [finish],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runDemo().catch((err) => {
      setStatus("failed");
      setMessage(`Engine failed to start: ${(err as Error).message}`);
    });
  }, [runDemo]);

  return (
    <Ctx.Provider value={{ status, message, log, runId, engine, region, setRegion, regions, runFiles, runDemo }}>
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
