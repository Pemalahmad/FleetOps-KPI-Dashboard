"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useEngine } from "../engine-provider";
import { guessBodyStyle, modelKey, type BodyStyle } from "@/lib/car-styles";

/** Demo choices live in tab memory, like every other demo action; the owner's are saved in the sealed workspace. */
let demo: Record<string, BodyStyle> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const EMPTY: Record<string, BodyStyle> = {};

export interface ModelLike { make: string | null; model: string | null }

export function useCarStyles() {
  const { dataset, workspace, updateCarStyle } = useEngine();
  const practice = useSyncExternalStore(subscribe, () => demo, () => EMPTY);
  const chosen = dataset === "demo" ? practice : workspace?.carStyles ?? EMPTY;
  const styleFor = useCallback((v: ModelLike): BodyStyle =>
    chosen[modelKey(v.make, v.model)] ?? guessBodyStyle(v.make, v.model), [chosen]);
  const set = useCallback(async (key: string, style: BodyStyle | null) => {
    if (dataset === "demo") {
      const next = { ...demo };
      if (style) next[key] = style; else delete next[key];
      demo = next;
      listeners.forEach((l) => l());
      return;
    }
    await updateCarStyle(key, style);
  }, [dataset, updateCarStyle]);
  return { chosen, styleFor, set, demo: dataset === "demo" };
}
