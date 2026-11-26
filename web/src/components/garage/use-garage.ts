"use client";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useEngine } from "../engine-provider";
import { emptyGarage, type GarageState } from "@/lib/garage";

const initialDemo = emptyGarage();
let demo = initialDemo;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const demoSnapshot = () => demo;
const serverSnapshot = () => initialDemo;
const emptyOwner = emptyGarage();

/** Demo work lives in tab memory; owner work uses the vault-aware Workspace mutator. */
export function useGarageOperations() {
  const { dataset, workspace, updateGarage, status } = useEngine();
  const practice = useSyncExternalStore(subscribe, demoSnapshot, serverSnapshot);
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const state = dataset === "demo" ? practice : workspace?.garage ?? emptyOwner;
  const change = useCallback(async (update: (state: GarageState) => GarageState): Promise<boolean> => {
    if (busy.current || status !== "ready") return false;
    busy.current = true; setSaving(true); setError(null);
    try {
      if (dataset === "demo") {
        demo = update(demo);
        for (const listener of listeners) listener();
      } else await updateGarage(update);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Garage action could not be saved.");
      return false;
    } finally { busy.current = false; setSaving(false); }
  }, [dataset, status, updateGarage]);
  return { state, change, saving, error };
}
