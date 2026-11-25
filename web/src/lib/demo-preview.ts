/**
 * Demo preview: the demo fleet's query results, saved by `scripts/demo-preview.mjs` into public/demo-preview.json, so a
 * first visit shows every widget filled at once instead of empty placeholders while the SQL engine (~15 MB) downloads
 * and the pipeline runs. The live engine replaces the preview as soon as it is ready.
 *
 * Rules: demo data only (never the owner's fleet), same origin, and only used when its fingerprint matches the SQL
 * manifest it was recorded against. If the SQL changes, the preview is ignored until it is regenerated.
 */
import type { PipelineLog, Row } from "./engine";
import { engineManifestUrl } from "./engine-manifest-url.mjs";

export interface DemoPreview {
  /** SHA-256 of public/engine/manifest.json when the preview was recorded. */
  fingerprint: string;
  log: PipelineLog;
  regions: string[];
  queries: Record<string, Row[]>;
}

/** On disk each result is stored as column names once plus rows of values. */
interface SavedPreview extends Omit<DemoPreview, "queries"> { queries: Record<string, { c: string[]; r: unknown[][] }> }

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loadDemoPreview(base: string): Promise<DemoPreview | null> {
  try {
    const [p, m] = await Promise.all([
      fetch(`${base}/demo-preview.json`),
      fetch(engineManifestUrl(base, process.env.NEXT_PUBLIC_FLEETOPS_ENGINE_REVISION)),
    ]);
    if (!p.ok || !m.ok) return null;
    const [saved, manifest] = await Promise.all([p.json() as Promise<SavedPreview>, m.text()]);
    if (!saved || typeof saved.queries !== "object" || saved.fingerprint !== (await sha256Hex(manifest))) return null;
    const queries = Object.fromEntries(Object.entries(saved.queries).map(([sql, { c, r }]) =>
      [sql, r.map((values) => Object.fromEntries(c.map((col, i) => [col, values[i]])) as Row)]));
    return { ...saved, queries };
  } catch {
    return null;   // no preview: widgets show their loading state as before
  }
}

/**
 * Recording happens only under browser automation (navigator.webdriver is set by Playwright and similar tools), so the
 * preview script can read the demo's results. Ordinary visits never record anything.
 */
type RecordingWindow = Window & { __fleetopsDemoPreview?: { log?: PipelineLog; regions?: string[]; queries: Record<string, Row[]> } };
const recording = () => typeof navigator !== "undefined" && navigator.webdriver === true;

export function recordDemoQuery(sql: string, rows: Row[]) {
  if (!recording()) return;
  const w = window as RecordingWindow;
  (w.__fleetopsDemoPreview ??= { queries: {} }).queries[sql] = rows;
}

export function recordDemoRun(log: PipelineLog, regions: string[]) {
  if (!recording()) return;
  const w = window as RecordingWindow;
  w.__fleetopsDemoPreview = { ...(w.__fleetopsDemoPreview ?? { queries: {} }), log, regions };
}
