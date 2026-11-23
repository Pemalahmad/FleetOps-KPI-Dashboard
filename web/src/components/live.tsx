"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Pause, Play, Broadcast } from "@phosphor-icons/react";
import NumberFlow from "@number-flow/react";
import { Chart } from "./chart";
import Button from "./arc/button";
import { useEngine, useSql } from "./engine-provider";
import { backfill, DUTY_STATES, fileEvent, liveStore, nextEvent, seed, type Cast, type DutyState, type LiveState } from "@/lib/live";
import { readFile, toCsv } from "@/lib/sheets";
import { uid, type SavedInput } from "@/lib/workspace";

export const useLive = () => useSyncExternalStore(liveStore.subscribe, liveStore.get, liveStore.get);

/* ----------------------------------------------------------------------------------------------- following a file */
interface FileHandle { name: string; getFile(): Promise<File> }
let followHandle: FileHandle | null = null;
let lastModified = 0;
/** Ask for a file to follow (Chrome and Edge: File System Access API). Returns false where the browser has no picker. */
export async function chooseFileToFollow(): Promise<boolean> {
  const w = window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]> };
  if (!w.showOpenFilePicker) return false;
  const [h] = await w.showOpenFilePicker({
    multiple: false, excludeAcceptAllOption: false,
    types: [{ description: "Spreadsheets", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"], "text/csv": [".csv"] } }],
  });
  followHandle = h; lastModified = 0;
  liveStore.set({ source: "file", follow: { name: h.name, checkedAt: null, changedAt: null, rebuilds: 0, error: null } });
  return true;
}
export function stopFollowing() { followHandle = null; liveStore.set({ source: null, follow: null }); }
export const canFollow = () => typeof window !== "undefined" && "showOpenFilePicker" in window;

/* ----------------------------------------------------------------------------------------------- the driver */
/** Mounted once in the shell: runs the demo feed, or polls the followed file. */
export function LiveDriver() {
  const { dataset, status, engine, workspace, commit, runId } = useEngine();
  const demo = dataset === "demo" && status === "ready";
  const vehicles = useSql<Cast["vehicles"][number]>(demo ? `SELECT v.vehicle_id AS id, coalesce(v.plate_number, v.vehicle_id) AS plate, coalesce(v.model, 'Vehicle') AS model,
      coalesce(s.site_name, v.region) AS site, v.powertrain FROM stg_vehicles v LEFT JOIN stg_sites s ON s.site_id = v.home_site_id WHERE v.is_active USING SAMPLE 400 ROWS` : null);
  const drivers = useSql<Cast["drivers"][number]>(demo ? `SELECT d.driver_id AS id, d.driver_name AS name, v.plate_number AS plate, coalesce(s.site_name, d.region) AS site, d.status
      FROM stg_drivers d LEFT JOIN stg_vehicles v USING (vehicle_id) LEFT JOIN stg_sites s ON s.site_id = d.home_site_id WHERE d.is_active USING SAMPLE 400 ROWS` : null);
  const away = useSql<Cast["drivers"][number]>(demo ? `SELECT d.driver_id AS id, d.driver_name AS name, v.plate_number AS plate, coalesce(s.site_name, d.region) AS site, d.status
      FROM stg_drivers d LEFT JOIN stg_vehicles v USING (vehicle_id) LEFT JOIN stg_sites s ON s.site_id = d.home_site_id
      WHERE d.status IN ('Suspended', 'On leave') QUALIFY row_number() OVER (PARTITION BY d.status ORDER BY d.driver_id) = 1` : null);
  const totals = useSql<{ active: number; open_jobs: number; km_day: number | null; alerts_day: number | null; staff_active: number; on_leave: number; suspended: number }>(demo ? `SELECT
      (SELECT count(*) FROM stg_vehicles WHERE is_active) AS active,
      (SELECT count(*) FROM stg_work_orders WHERE is_open) AS open_jobs,
      (SELECT sum(km) / nullif(date_diff('day', min(start_ts), max(start_ts)) + 7, 0) FROM stg_trips) AS km_day,
      (SELECT sum(speeding_events + harsh_events + geofence_exits) / nullif(date_diff('day', min(start_ts), max(start_ts)) + 7, 0) * 0.04 FROM stg_trips) AS alerts_day,
      (SELECT count(*) FROM stg_drivers d LEFT JOIN mart_driver_compliance c USING (driver_id) WHERE d.status = 'Active' AND coalesce(c.compliance_status, '') <> 'Not compliant') AS staff_active,
      (SELECT count(*) FROM stg_drivers WHERE status = 'On leave') AS on_leave,
      (SELECT count(*) FROM stg_drivers d LEFT JOIN mart_driver_compliance c USING (driver_id) WHERE d.status = 'Suspended' OR (d.status = 'Active' AND c.compliance_status = 'Not compliant')) AS suspended` : null);
  const cast = useRef<Cast | null>(null);

  // demo feed
  useEffect(() => {
    if (!demo || !vehicles.data || !drivers.data || !away.data || !totals.data?.[0]) return;
    if (liveStore.get().source === "file") return;
    const t = totals.data[0], km = Number(t.km_day ?? 0);
    // two drivers who are away (on leave, suspended) sit in the roster among the working ones
    const list = drivers.data.slice();
    away.data.forEach((d, i) => list.splice(4 + i * 5, 0, d));
    cast.current = { vehicles: vehicles.data, drivers: list, active: Number(t.active), openJobs: Number(t.open_jobs),
      perDay: { km, trips: km / 32, alerts: Number(t.alerts_day ?? 0) },
      staff: { active: Number(t.staff_active), onLeave: Number(t.on_leave), suspended: Number(t.suspended) } };
    liveStore.set(seed(cast.current));
    liveStore.set(backfill(liveStore.get(), cast.current));
    let timer = 0;
    const tick = () => {
      const s = liveStore.get();
      if (!s.paused && !document.hidden && s.source === "demo" && cast.current) liveStore.set(nextEvent(s, cast.current, Math.random));
      timer = window.setTimeout(tick, 1600 + Math.random() * 1600);
    };
    timer = window.setTimeout(tick, 900);
    return () => { window.clearTimeout(timer); if (liveStore.get().source === "demo") liveStore.reset(); };
  }, [demo, vehicles.data, drivers.data, away.data, totals.data, runId]);

  // followed file
  const ref = useRef({ engine, workspace, commit });
  useEffect(() => { ref.current = { engine, workspace, commit }; }, [engine, workspace, commit]);
  useEffect(() => {
    let timer = 0, busy = false;
    const poll = async () => {
      const h = followHandle, s = liveStore.get();
      if (h && s.follow && !busy && !s.paused) {
        busy = true;
        try {
          const file = await h.getFile();
          const now = Date.now();
          if (lastModified && file.lastModified !== lastModified) await reimport(file, now);
          lastModified = file.lastModified;
          liveStore.set({ follow: { ...liveStore.get().follow!, checkedAt: now, error: null } });
        } catch (e) {
          liveStore.set({ follow: { ...liveStore.get().follow!, checkedAt: Date.now(), error: (e as Error).message } });
        } finally { busy = false; }
      }
      timer = window.setTimeout(poll, 6000);
    };
    const reimport = async (file: File, now: number) => {
      const { engine: eng, workspace: ws, commit: save } = ref.current;
      if (!eng || !ws) throw new Error("Import this file once on the Import page first, so its columns are mapped.");
      const sheets = await readFile(file, eng.manifest.tables);
      const fresh: SavedInput[] = sheets.flatMap((sh) => {
        const prev = ws.inputs.find((i) => i.label === sh.id);
        return prev ? [{ ...prev, id: uid("in"), csv: sh.kind === "tabular" ? toCsv(sh) : undefined, bytes: sh.bytes, rows: sh.rows.length, added: new Date(now).toISOString() }] : [];
      });
      if (!fresh.length) throw new Error("None of this file's sheets are in your fleet yet. Import it once on the Import page, then follow it.");
      await save((c) => ({ ...c, inputs: [...c.inputs.filter((i) => !fresh.some((f) => f.label === i.label)), ...fresh] }));
      const st = liveStore.get();
      const rows = fresh.reduce((n, f) => n + f.rows, 0);
      liveStore.set({ events: [fileEvent(`${file.name} changed`, `${fresh.length} sheet(s), ${rows.toLocaleString()} rows re-imported; dashboards rebuilt`, "good", now), ...st.events].slice(0, 40),
        follow: { ...st.follow!, changedAt: now, rebuilds: (st.follow?.rebuilds ?? 0) + 1 } });
    };
    timer = window.setTimeout(poll, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

/* ----------------------------------------------------------------------------------------------- top-bar badge */
export function LiveBadge() {
  const s = useLive();
  if (!s.source) return null;
  const last = s.events[0];
  return (
    <div className="live-badge" role="status" aria-live="off">
      <span className="live-dot" data-paused={s.paused || undefined} aria-hidden="true" />
      <b className="mono-label !text-[10px]">{s.paused ? "Paused" : "Live"}</b>
      {last && <span key={last.id} className="live-last">{last.text}{last.detail ? <span className="text-muted"> · {last.detail}</span> : null}</span>}
      <button className="live-toggle" onClick={() => liveStore.set({ paused: !s.paused })} aria-label={s.paused ? "Resume live updates" : "Pause live updates"}>
        {s.paused ? <Play size={12} weight="fill" /> : <Pause size={12} weight="fill" />}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- dashboard panel */
/** A picture for each kind of event, so the feed scans at a glance. */
function eventEmoji(e: LiveState["events"][number]): string {
  switch (e.kind) {
    case "trip": return e.tone ? "🏎️" : "🚗";
    case "workshop_in": return "🔧";
    case "ready": return "✅";
    case "handover": return "🛣️";
    case "energy": return e.text.endsWith("charged") ? "⚡" : "⛽";
    case "fine": return "🧾";
    case "shift": return e.text.includes("break") ? "☕" : e.text.includes("ended") ? "🌙" : "🟢";
    case "alert": return e.text.startsWith("Left") ? "📍" : e.text.startsWith("Long") ? "⏳" : "⚠️";
    default: return "📄";
  }
}
const ago = (t: number, now: number) => { const s = Math.max(0, Math.round((now - t) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

function Num({ label, value, decimals = 0, unit }: { label: string; value: number; decimals?: number; unit?: string }) {
  return (
    <div className="live-num">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className="tnum text-[22px] font-semibold leading-none tracking-[-0.02em]">
        <NumberFlow value={value} format={{ maximumFractionDigits: decimals }} />{unit && <span className="ml-0.5 text-[12px] font-normal text-muted">{unit}</span>}
      </span>
    </div>
  );
}

/** Live numbers, a streaming chart and the incoming events. `focus` picks which numbers lead. */
export function LivePanel({ focus = "fleet" }: { focus?: "fleet" | "drivers" | "garage" }) {
  const s = useLive();
  if (!s.source) return null;
  if (s.source === "file") return <FollowCard s={s} />;
  const now = s.series.at(-1)?.t ?? s.events[0]?.at ?? 0;
  const nums = focus === "drivers"
    ? [{ label: "Trips today", value: s.tripsToday }, { label: "Kilometres today", value: s.kmToday }, { label: "Alerts today", value: s.alertsToday }, { label: "Events per minute", value: s.series.at(-1)?.perMin ?? 0 }]
    : focus === "garage"
      ? [{ label: "In the workshop now", value: s.inWorkshop }, { label: "Open jobs", value: s.openJobs }, { label: "On the road now", value: s.onRoad }, { label: "Events per minute", value: s.series.at(-1)?.perMin ?? 0 }]
      : [{ label: "On the road now", value: s.onRoad }, { label: "In the workshop now", value: s.inWorkshop }, { label: "Kilometres today", value: s.kmToday }, { label: "Events per minute", value: s.series.at(-1)?.perMin ?? 0 }];
  return (
    <section className="live-panel" aria-label="Live feed">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span className="live-dot" data-paused={s.paused || undefined} aria-hidden="true" /><b className="mono-label">Live</b>
          <span className="text-[11.5px] text-muted">Simulated demo feed: events generated in your browser from the demo fleet</span></span>
        <Button variant="secondary" size="sm" onClick={() => liveStore.set({ paused: !s.paused })}>{s.paused ? <><Play size={13} weight="fill" /> Resume</> : <><Pause size={13} weight="fill" /> Pause</>}</Button>
      </header>
      <div className="live-grid">
        <div className="live-nums">{nums.map((n) => <Num key={n.label} {...n} />)}</div>
        <div className="min-w-0">
          <Chart height={150} option={(dark) => ({
            grid: { left: 4, right: 4, top: 22, bottom: 4, containLabel: true },
            tooltip: { trigger: "axis" }, legend: { right: 0, top: 0 },
            animationDurationUpdate: 600, animationEasingUpdate: "linear",
            xAxis: { type: "category", boundaryGap: false, data: s.series.map((p) => new Date(p.t).toLocaleTimeString("en-GB")), axisLabel: { show: false } },
            yAxis: [{ type: "value", scale: true, splitNumber: 2 }, { type: "value", splitNumber: 2, splitLine: { show: false } }],
            series: [
              { name: focus === "garage" ? "In the workshop" : "On the road", type: "line", smooth: 0.3, symbol: "none", lineStyle: { width: 2, color: dark ? "#818cf8" : "#6366f1" }, itemStyle: { color: dark ? "#818cf8" : "#6366f1" },
                areaStyle: { color: dark ? "rgba(129,140,248,.10)" : "rgba(99,102,241,.07)" }, data: s.series.map((p) => (focus === "garage" ? p.inWorkshop : p.onRoad)) },
              { name: "Events / min", type: "bar", yAxisIndex: 1, barWidth: 3, itemStyle: { color: dark ? "#475569" : "#cbd5e1" }, data: s.series.map((p) => p.perMin) },
            ],
          })} />
        </div>
        <ul className="live-feed" aria-label="Latest events">
          {s.events.slice(0, 6).map((e) => (
            <li key={e.id} className="live-item">
              <span className="live-emoji" data-tone={e.tone} aria-hidden="true">{eventEmoji(e)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px]">{e.text}</span>{e.detail && <span className="block truncate text-[11px] text-muted">{e.detail}</span>}</span>
              <span className="tnum shrink-0 text-[10.5px] text-muted">{ago(e.at, now)}</span>
            </li>
          ))}
          {!s.events.length && <li className="py-6 text-center text-[12px] text-muted"><Broadcast size={18} className="mx-auto mb-1" />Waiting for the first event…</li>}
        </ul>
      </div>
    </section>
  );
}

function FollowCard({ s }: { s: LiveState }) {
  const f = s.follow!;
  const t = (x: number | null) => (x ? new Date(x).toLocaleTimeString("en-GB") : "–");
  return (
    <section className="live-panel" aria-label="Following a file">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span className="live-dot" data-paused={s.paused || undefined} aria-hidden="true" /><b className="mono-label">Live</b>
          <span className="text-[12px] text-muted">Following <b className="text-text">{f.name}</b>: checked {t(f.checkedAt)}, last change {t(f.changedAt)}, {f.rebuilds} rebuild{f.rebuilds === 1 ? "" : "s"}</span></span>
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => liveStore.set({ paused: !s.paused })}>{s.paused ? "Resume" : "Pause"}</Button>
          <Button variant="ghost" size="sm" onClick={stopFollowing}>Stop following</Button>
        </span>
      </header>
      {f.error && <p role="alert" className="mt-2 text-[12.5px] text-bad">{f.error}</p>}
      {s.events[0] && <p className="mt-2 text-[12.5px] text-muted">{s.events[0].text} · {s.events[0].detail}</p>}
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------- driver status */
export const DUTY_META: Record<DutyState, { emoji: string; color: string; note: string }> = {
  "On a trip": { emoji: "🚗", color: "var(--accent-ink)", note: "Driving a job now" },
  Available: { emoji: "🟢", color: "var(--good)", note: "On shift, waiting for a job" },
  "On a break": { emoji: "☕", color: "var(--warn)", note: "Paused mid-shift" },
  "Off duty": { emoji: "🌙", color: "var(--faint)", note: "Not on shift" },
  "On leave": { emoji: "🏖️", color: "#94a3b8", note: "On leave in the driver file" },
  Suspended: { emoji: "⛔", color: "var(--bad)", note: "Suspended in the driver file, or not compliant (licence expired or wrong class)" },
};
const since = (t: number, now: number) => { const m = Math.max(0, Math.round((now - t) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

/** Who is doing what right now: the duty split across all drivers, and a roster that moves with the feed. */
export function DriverStatusBoard() {
  const s = useLive();
  if (s.source !== "demo" || !s.duty) return null;
  const total = DUTY_STATES.reduce((n, k) => n + s.duty![k], 0) || 1;
  const now = s.series.at(-1)?.t ?? s.events[0]?.at ?? 0;
  return (
    <section className="live-panel" aria-label="Driver status now">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span className="live-dot" data-paused={s.paused || undefined} aria-hidden="true" /><b className="mono-label">Driver status now</b>
          <span className="text-[11.5px] text-muted">Simulated from the demo drivers; leave and suspensions come from the driver file</span></span>
      </header>
      <div className="duty-bar mt-3" role="img" aria-label={DUTY_STATES.map((k) => `${k}: ${s.duty![k]}`).join(", ")}>
        {DUTY_STATES.map((k) => <span key={k} style={{ width: `${(100 * s.duty![k]) / total}%`, background: DUTY_META[k].color }} title={`${k}: ${s.duty![k].toLocaleString()}`} />)}
      </div>
      <div className="duty-grid mt-3">
        {DUTY_STATES.map((k) => (
          <div key={k} className="duty-cell" title={DUTY_META[k].note}>
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span aria-hidden="true">{DUTY_META[k].emoji}</span>{k}</span>
            <span className="tnum text-[20px] font-semibold leading-none"><NumberFlow value={s.duty![k]} /></span>
            <span className="tnum text-[11px] text-muted">{((100 * s.duty![k]) / total).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <ul className="duty-roster mt-3" aria-label="Roster">
        {s.roster.map((d) => (
          <li key={d.id} className="duty-person">
            <span className="duty-avatar" aria-hidden="true">{d.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium">{d.name}</span>
              <span className="block truncate text-[11px] text-muted">{[d.plate, d.site].filter(Boolean).join(" · ")}</span></span>
            <span key={d.state} className="duty-chip" style={{ color: DUTY_META[d.state].color, background: `color-mix(in srgb, ${DUTY_META[d.state].color} 13%, transparent)` }}>
              {DUTY_META[d.state].emoji} {d.state}</span>
            <span className="tnum hidden w-[70px] shrink-0 text-right text-[10.5px] text-muted sm:block">{d.state === "On leave" || d.state === "Suspended" ? "" : since(d.since, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
