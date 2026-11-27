import type { PipelineLog } from "./engine";

export interface Sop {
  file: string;
  meta: Record<string, string>;
  steps: string[];
  body: string;
  guidance: string;
}

export function parseSop(file: string, text: string): Sop {
  const normalized = text.replace(/\r\n/g, "\n");
  const fm = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  for (const line of (fm?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = fm ? normalized.slice(fm[0].length) : normalized;
  const steps = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => m[1]);
  const guidance = body.replace(/## Steps\n[\s\S]*?(?=\n## |$)/, "");
  return { file, meta, steps, body, guidance };
}

export const SOP_PAGES: Record<string, { href: string; label: string }> = {
  "SOP-01": { href: "/pipeline/", label: "Inspect pipeline" },
  "SOP-02": { href: "/", label: "Review overview" },
  "SOP-03": { href: "/workshop/", label: "Inspect workshop" },
  "SOP-04": { href: "/licence/", label: "Review recalls" },
  "SOP-05": { href: "/licence/", label: "Review maintenance" },
  "SOP-06": { href: "/ledger/", label: "Review ledger" },
  "SOP-07": { href: "/licence/", label: "Review renewals" },
  "SOP-08": { href: "/customer/", label: "Review customer evidence" },
  "SOP-09": { href: "/", label: "Open Garage" },
  "SOP-10": { href: "/iso/", label: "Open ISO certification" },
};

export interface SopSignal { state: "active" | "routine" | "unknown"; reason: string }
export type SopCounts = Record<string, number | null>;
type Target = { green: number; direction: string };

/** Live flags stay independent of checklist progress. Missing evidence is never a clean bill of health. */
export function sopSignal(id: string, log: PipelineLog | null, counts: SopCounts | null,
  values: Record<string, number | null>, targets: Record<string, Target>): SopSignal {
  if (id === "SOP-01") {
    if (!log) return { state: "unknown", reason: "Run the pipeline to assess data quality." };
    return !log.ok || log.issues.length
      ? { state: "active", reason: String(log.issues.length) + " data-quality findings; review the pipeline before acting." }
      : { state: "routine", reason: "Pipeline passed. Reconcile source totals at each refresh." };
  }
  if (id === "SOP-10") return { state: "routine", reason: "Check certificate status, audit dates and overdue findings in ISO certification." };
  if (!log?.ok || !counts) return { state: "unknown", reason: "Waiting for verified pipeline evidence." };
  if (id === "SOP-02") return { state: "routine", reason: "Weekly review; assign owners and dates to unresolved signals." };
  const n = counts[id];
  const watched: Record<string, string[]> = {
    "SOP-03": ["repeat_repair", "parts"], "SOP-08": ["low_rating", "goodwill"],
    "SOP-07": ["fines"],
  };
  const nodeTargets: Record<string, string> = {
    repeat_repair: "repeat_repair_pct", parts: "parts_on_time_pct",
    low_rating: "low_rating_pct", goodwill: "goodwill_pct", fines: "fines_per_100_vehicles",
  };
  const breaches = (watched[id] ?? []).filter((metric) => {
    const v = values[metric], t = targets[nodeTargets[metric]];
    return v != null && Number.isFinite(v) && t && (t.direction === "higher" ? v < t.green : v > t.green);
  });
  const reasons: Record<string, string> = {
    "SOP-03": "sites flagged INTERVENE in the latest complete week",
    "SOP-04": "mature campaign-region groups below the recall target",
    "SOP-05": "vehicles overdue for preventive maintenance",
    "SOP-06": "regions over budget in the report month",
    "SOP-07": "active registration/insurance records expired, expiring or missing",
    "SOP-08": "low-rated work orders in the report month",
    "SOP-09": "open vehicle damage escalations",
  };
  if ((n ?? 0) > 0 || breaches.length) return {
    state: "active",
    reason: [(n ?? 0) > 0 ? String(n) + " " + reasons[id] : "", breaches.length ? "Off target: " + breaches.join(", ").replaceAll("_", " ") : ""].filter(Boolean).join(". "),
  };
  const sources: Record<string, string[]> = {
    "SOP-03": ["sites", "work_orders"], "SOP-04": ["recalls", "recall_vehicles", "work_orders"],
    "SOP-05": ["vehicles", "work_orders"], "SOP-06": ["vehicles", "work_orders", "usage"],
    "SOP-07": ["vehicles"], "SOP-08": ["feedback", "work_orders"],
  };
  if ((sources[id] ?? []).some((table) => !log.loads.some((load) => load.table === table && load.source)))
    return { state: "unknown", reason: "Source records are missing; absence of a trigger is not evidence of recovery." };
  if (n == null || log.mode === "registry") return { state: "unknown", reason: "Operational evidence is incomplete. Check the source records." };
  return { state: "routine", reason: "No automatic trigger in the loaded evidence; scheduled review still applies." };
}

/** A fresh checklist for each dataset, scope, snapshot and procedure revision. */
export function sopProgressKey(dataset: string, name: string, region: string | null, snapshot: string, sop: Sop) {
  return "fleetops:sop:" + JSON.stringify([dataset, name, region, snapshot, sop.meta.id, sop.steps]);
}
