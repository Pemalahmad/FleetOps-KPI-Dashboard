"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useEngine, useSql } from "../engine-provider";
import { emptyService, type ServiceState } from "@/lib/service";
import { demoService, type DemoVehicle } from "@/lib/service-demo";

/** Sixty demo vehicles spread across regions; the practice board is built from them once per tab. */
export const DEMO_SERVICE_VEHICLES_SQL =
  "SELECT vehicle_id, plate_number, make, model FROM mart_fleet_registry WHERE is_active ORDER BY hash(vehicle_id) LIMIT 60";

let demo: ServiceState | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = () => { for (const l of listeners) l(); };
const emptyOwner = emptyService();

/** Demo work lives in tab memory; owner work is saved through the vault-aware workspace. */
export function useServiceBoard() {
  const { dataset, workspace, updateService, status, preview } = useEngine();
  const vehicles = useSql<DemoVehicle>(dataset === "demo" ? DEMO_SERVICE_VEHICLES_SQL : null);
  const practice = useSyncExternalStore(subscribe, () => demo, () => null);
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (dataset === "demo" && !demo && vehicles.data?.length) { demo = demoService(vehicles.data, new Date().toISOString()); emit(); }
  }, [dataset, vehicles.data]);

  const state = dataset === "demo" ? practice : workspace?.service ?? emptyOwner;
  const canEdit = status === "ready" && !preview;
  const change = async (update: (s: ServiceState) => ServiceState, detail: string): Promise<boolean> => {
    if (busy.current || !canEdit || !state) return false;
    busy.current = true; setSaving(true); setError(null);
    try {
      if (dataset === "demo") { demo = update(demo ?? emptyService()); emit(); }
      else await updateService(update, detail);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The service order could not be saved.");
      return false;
    } finally { busy.current = false; setSaving(false); }
  };
  return { state, change, saving, error, setError, canEdit, demo: dataset === "demo", vehicles: vehicles.data };
}
