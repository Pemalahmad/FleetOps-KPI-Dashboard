"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { Bell, Car, ChartPieSlice, CheckCircle, Flag, MagnifyingGlass, ShieldCheck, Trophy, Warning, Wrench, X } from "@phosphor-icons/react";
import { useEngine, useSql } from "../engine-provider";
import { Card, Label, Skeleton } from "../ui";
import { Glare, HeaderDots, Pull, Sparks } from "../bits/fleetops-bits";
import { buildAlerts, deriveVehicle, LANES, localDate, vehicleLabel, type GarageAlert, type GarageContext, type GarageLane, type GarageRow, type GarageVehicle } from "@/lib/garage";
import { GARAGE_SQL } from "@/lib/garage-query";
import { GarageCar } from "./car";
import { Garage3D } from "./garage-3d";
import { useCarStyles } from "./use-car-styles";
import { IncidentDialog } from "./incident-dialog";
import { VehicleDialog } from "./vehicle-dialog";
import { useGarageOperations } from "./use-garage";
import { LivePanel } from "../live";
import Button from "../arc/button";
import { PageArt } from "../art";

const EMPTY: GarageRow[] = [];
const NUM = new Intl.NumberFormat("en");
const PAGE_SIZE = 24;
const PRIORITY: Record<GarageLane, number> = { incident: 0, renewal: 1, repair: 2, dispatch: 3, verify: 4, road: 5 };

export function GaragePage() {
  const engine = useEngine(), operations = useGarageOperations(), carStyles = useCarStyles();
  const source = useSql<GarageRow>(GARAGE_SQL);
  const [selectedId, setSelectedId] = useState<string | null>(null), [incidentFor, setIncidentFor] = useState<string | null | undefined>(undefined);
  const [notifications, setNotifications] = useState(false), [search, setSearch] = useState(""), [filter, setFilter] = useState<GarageLane | "all">("all"), [page, setPage] = useState(0);
  const [alertKind, setAlertKind] = useState<GarageAlert["priority"] | "all">("all"), [alertPage, setAlertPage] = useState(0);
  const today = localDate();
  const context = useMemo<GarageContext>(() => ({
    snapshot: engine.log?.snapshot ?? "", today, demo: engine.dataset === "demo", operations: engine.log?.mode === "operations",
    recallCoverage: ["recalls", "recall_vehicles", "work_orders"].every((table) => engine.log?.loads.some((l) => l.table === table && l.source)),
  }), [engine.log, engine.dataset, today]);
  const all = useMemo(() => (source.data ?? EMPTY).map((row) => deriveVehicle(row, operations.state, context)), [source.data, operations.state, context]);
  const vehicles = useMemo(() => all.filter((v) => !engine.region || v.row.region === engine.region), [all, engine.region]);
  const groups = useMemo(() => Object.fromEntries(LANES.map((l) => [l.id, vehicles.filter((v) => v.lane === l.id)])) as Record<GarageLane, GarageVehicle[]>, [vehicles]);
  const alerts = useMemo(() => buildAlerts(vehicles), [vehicles]);
  const acknowledged = useMemo(() => new Set(operations.state.acknowledged), [operations.state.acknowledged]);
  const unread = alerts.filter((a) => !acknowledged.has(a.id)).length;
  const critical = alerts.filter((a) => a.priority === "critical").length;
  const filteredAlerts = useMemo(() => alerts.filter((a) => alertKind === "all" || a.priority === alertKind)
    .sort((a, b) => Number(acknowledged.has(a.id)) - Number(acknowledged.has(b.id))), [alerts, acknowledged, alertKind]);
  const alertPages = Math.max(1, Math.ceil(filteredAlerts.length / 50));
  const safeAlertPage = Math.min(alertPage, alertPages - 1);
  const visibleAlerts = filteredAlerts.slice(safeAlertPage * 50, (safeAlertPage + 1) * 50);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => (filter === "all" || v.lane === filter) &&
      (!q || [v.row.vehicle_id, v.row.plate_number, v.row.make, v.row.model, v.row.home_site_name].some((s) => s?.toLowerCase().includes(q))))
      .sort((a, b) => PRIORITY[a.lane] - PRIORITY[b.lane] || vehicleLabel(a.row).localeCompare(vehicleLabel(b.row)));
  }, [vehicles, search, filter]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selected = selectedId ? vehicles.find((v) => v.row.vehicle_id === selectedId) : null;
  const ready = engine.status === "ready" && source.data !== null;
  const ids = useMemo(() => new Set(vehicles.map((v) => v.row.vehicle_id)), [vehicles]);
  const handovers = operations.state.handovers.filter((h) => ids.has(h.vehicleId));
  const doneToday = handovers.filter((h) => localDate(new Date(h.at)) === today).length;
  const xp = handovers.length * 50;
  const level = crewLevel(handovers.length);
  const roadPct = vehicles.length ? Math.round((100 * groups.road.length) / vehicles.length) : 0;
  const badges = [
    { label: "First handover", earned: handovers.length >= 1, hint: "Record one reviewed handover" },
    { label: "Five clean", earned: handovers.length >= 5, hint: "Record five reviewed handovers" },
    { label: "Recovery done", earned: handovers.some((h) => h.incidentIds.length > 0), hint: "Hand over a vehicle after accident recovery" },
    { label: "Desk clear", earned: vehicles.length > 0 && groups.renewal.length === 0, hint: "No vehicle waiting at the renewal desk" },
    { label: "No critical", earned: vehicles.length > 0 && critical === 0, hint: "No critical safety or compliance alert" },
  ];
  const filterQueue = (lane: GarageLane | "all") => {
    setFilter(lane); setPage(0);
    document.getElementById("garage-queue")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const openVehicle = (id: string) => { setSelectedId(id); setNotifications(false); };
  const markRead = async (items: GarageAlert[]) => {
    await operations.change((s) => ({ ...s, acknowledged: [...new Set([...s.acknowledged, ...items.map((a) => a.id)])] }));
  };
  return <Sparks>
    <header className="garage-header page-head page-head-dots">
      <HeaderDots />
      <PageArt kind="garage" />
      <div><Label>Fleet garage</Label><h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[38px]">Every vehicle <span className="text-faint">has a next move.</span></h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">See what is holding each car back, work through its checks, and bring it back to the road.</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className="ops-button" href="/overview/"><ChartPieSlice size={17} /> Analytics</Link>
        <button className="ops-button" disabled={!ready} onClick={() => setNotifications(true)}><Bell size={17} /> Alerts <span className="garage-count">{unread > 99 ? "99+" : unread}</span></button>
        <Pull><Button className="arc-accent" size="lg" disabled={!ready || !vehicles.length} onClick={() => setIncidentFor(null)}><Warning size={17} /> Report accident</Button></Pull>
      </div>
    </header>
    <div className="garage-context">
      <span className="garage-context-dot" /><span>{engine.region ?? "All regions"}</span><span>Report {context.snapshot.slice(0, 10) || "loading"}</span>
      <span className="ml-auto">{context.demo ? "Practice garage · actions stay in this tab" : "My garage · saved with this fleet"}</span>
    </div>
    {source.error && <Card className="mb-5"><p role="alert" className="text-sm text-bad">Garage evidence could not be loaded: {source.error}</p><Link href="/pipeline/" className="ops-button mt-3">Review pipeline</Link></Card>}
    {operations.error && incidentFor === undefined && !selected && <p role="alert" className="mb-4 text-sm text-bad">{operations.error}</p>}
    {!ready ? engine.status === "failed" ? <Card><p role="alert" className="text-sm text-bad">The fleet report did not finish. Review the failed stage and rebuild before using the garage.</p><Link className="ops-button mt-3" href="/pipeline/">Review pipeline</Link></Card> : <Skeleton height={620} /> : <>
      {critical > 0 && <div className="garage-safety-banner">
        <Warning size={23} weight="fill" className="shrink-0 text-bad" /><div><p className="text-sm font-semibold">{NUM.format(critical)} safety or compliance alert{critical === 1 ? "" : "s"}</p>
          <p className="mt-0.5 text-xs text-muted">Incident holds and expired documents stay visible until the underlying evidence changes.</p></div>
        <button onClick={() => setNotifications(true)} className="ops-button ml-auto shrink-0">Review alerts</button>
      </div>}
      <section className="garage-pulse" aria-label="Garage summary">
        <Pulse icon={<Car size={20} />} value={groups.road.length} label="Road ready in report" color="var(--good)" onClick={() => filterQueue("road")} />
        <Pulse icon={<Wrench size={20} />} value={groups.repair.length} label="In repair bays" color="var(--accent)" onClick={() => filterQueue("repair")} />
        <Pulse icon={<ShieldCheck size={20} />} value={groups.renewal.length} label="At the renewal desk" color="var(--warn)" onClick={() => filterQueue("renewal")} />
        <Pulse icon={<CheckCircle size={20} />} value={groups.dispatch.length} label="For dispatch review" color="var(--good)" onClick={() => filterQueue("dispatch")} />
      </section>

      <LivePanel focus="garage" />
      <section className="garage-floor" aria-label="Visual fleet garage">
        <div className="garage-floor-header"><div><h2 className="text-lg font-semibold">The garage floor</h2><p className="mt-1 text-xs text-muted">{NUM.format(vehicles.length)} vehicles across six work zones. Accident holds flash; repair bays lift the car.</p></div>
          <div className="flex items-center gap-2"><Link href="/fleet/#car-shapes" className="garage-report-badge hover:text-accent">Match car shapes</Link><span className="garage-report-badge">Live from the loaded report</span></div></div>
        <Garage3D groups={groups} onOpen={openVehicle} styleFor={carStyles.styleFor} />
        <div className="garage-zones">{LANES.map((lane) => <section key={lane.id} className="garage-zone" aria-label={lane.label + " queue"}><Glare>
          <header className="flex items-baseline justify-between gap-2"><h3 className="flex items-center gap-2 text-[13px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: lane.color }} />{lane.label}</h3>
            <span className="tnum text-lg font-semibold" style={{ color: lane.color }}>{NUM.format(groups[lane.id].length)}</span></header>
          <p className="mt-0.5 text-[11px] text-muted">{lane.description}</p>
          <div className="garage-bays">{groups[lane.id].slice(0, 3).map((v) => <button className="garage-bay" key={v.row.vehicle_id} onClick={() => openVehicle(v.row.vehicle_id)}
            aria-label={vehicleLabel(v.row) + ", " + (v.row.make ?? "") + " " + (v.row.model ?? "") + ", " + lane.label}>
            <span className="garage-bay-plate">{vehicleLabel(v.row)}</span><span className="garage-bay-model">{v.row.model ?? v.row.vehicle_id}</span>
          </button>)}
            {!groups[lane.id].length && <div className="garage-zone-empty"><CheckCircle size={16} /> Clear</div>}
          </div>
          <button className="garage-zone-footer" onClick={() => filterQueue(lane.id)}>View all<span aria-hidden="true">→</span></button>
        </Glare></section>)}</div>
      </section>

      <section className="garage-progress-grid" aria-label="Garage missions">
        <div className="garage-crew">
          <div className="flex items-center gap-3"><span className="garage-crew-badge"><Trophy size={22} weight="duotone" /></span>
            <div className="min-w-0"><p className="text-[12px] text-muted">Crew rank</p><p className="text-[17px] font-semibold leading-tight">{level.name}</p></div>
            <p className="tnum ml-auto text-right text-[22px] font-bold leading-none">{NUM.format(xp)}<span className="block text-[11px] font-medium text-muted">XP</span></p></div>
          <div className="mt-4"><div className="garage-xp"><span style={{ width: level.pct + "%" }} /></div>
            <p className="mt-1.5 flex justify-between text-[11px] text-muted"><span>{level.next ? NUM.format(level.toNext) + " XP to " + level.next : "Top rank reached"}</span><span className="tnum">{doneToday} handover{doneToday === 1 ? "" : "s"} today</span></p></div>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Badges">{badges.map((b) => <span key={b.label} title={b.hint} className={"garage-badge " + (b.earned ? "garage-badge-earned" : "")}>{b.earned ? "★" : "☆"} {b.label}</span>)}</div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted">50 XP per reviewed handover. XP never clears a safety or document gate.{context.demo ? " Practice progress resets on reload." : ""}</p>
        </div>
        <div className="garage-missions"><div className="mb-3 flex items-center gap-2"><Flag size={17} className="text-accent" /><h2 className="text-[15px] font-semibold">Recovery missions</h2><span className="ml-auto text-[11px] text-muted">Road ready {roadPct}%</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Mission title="Recover accident holds" text="Assign an owner and move recovery through its stages." count={groups.incident.length} total={vehicles.length} color="var(--bad)" onClick={() => filterQueue("incident")} />
            <Mission title="Clear the renewal desk" text="Track submissions and refresh expiry evidence." count={groups.renewal.length} total={vehicles.length} color="var(--warn)" onClick={() => filterQueue("renewal")} />
            <Mission title="Finish the repair queue" text="Resolve open work and capture repair-ready." count={groups.repair.length} total={vehicles.length} color="var(--accent)" onClick={() => filterQueue("repair")} />
            <Mission title="Complete the handover" text="Verify source gates and sign off the checklist." count={groups.dispatch.length} total={vehicles.length} color="var(--good)" onClick={() => filterQueue("dispatch")} />
          </div>
        </div>
      </section>

      <section id="garage-queue" className="garage-queue mt-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Vehicle queue</h2><p className="mt-1 text-xs text-muted">Urgent holds first. Open any vehicle to work its next move.</p></div>
          <label className="garage-search"><MagnifyingGlass size={17} className="text-muted" /><input aria-label="Search garage vehicles" placeholder="Search plate, vehicle, model or site" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label></div>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Garage queue filters">
          <button aria-pressed={filter === "all"} className={"ops-chip " + (filter === "all" ? "ops-chip-active" : "")} onClick={() => { setFilter("all"); setPage(0); }}>All vehicles <span className="ml-2">{NUM.format(vehicles.length)}</span></button>
          {LANES.map((l) => <button key={l.id} aria-pressed={filter === l.id} className={"ops-chip " + (filter === l.id ? "ops-chip-active" : "")} onClick={() => { setFilter(l.id); setPage(0); }}>{l.label}<span className="ml-2">{NUM.format(groups[l.id].length)}</span></button>)}
        </div>
        <div className="relative overflow-x-auto rounded-xl border border-border bg-panel">
          <table className="garage-table"><thead><tr><th>Vehicle</th><th>Garage stage</th><th>Source gates</th><th>Next move</th><th>Site</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{visible.map((v) => {
              const lane = LANES.find((l) => l.id === v.lane)!;
              return <tr key={v.row.vehicle_id}><td><div className="flex items-center gap-3"><GarageCar small color={lane.color} /><div><b>{vehicleLabel(v.row)}</b><span className="mt-0.5 block text-xs text-muted">{v.row.make} {v.row.model} · {v.row.vehicle_id}</span></div></div></td>
                <td><span className="garage-lane-pill" style={{ color: lane.color, borderColor: "color-mix(in srgb, " + lane.color + " 30%, transparent)" }}>{lane.label}</span></td>
                <td><div className="flex items-center gap-1" aria-label={v.readiness + " of " + v.gates.length + " source gates passed"}>{v.gates.map((g) => <span key={g.id} className="h-1.5 w-4 rounded-full" title={g.label + ": " + g.status} style={{ background: g.status === "pass" ? "var(--good)" : g.status === "blocked" ? "var(--bad)" : "var(--border)" }} />)}</div><span className="mt-1 block text-[11px] text-muted">{v.readiness} / {v.gates.length} passed</span></td>
                <td className="max-w-[250px] text-xs text-muted">{v.incident ? RECOVERY_LABEL[v.incident.stage] : v.blockers[0] ?? (v.lane === "dispatch" ? "Complete release checklist" : "Available in report")}</td>
                <td className="text-xs text-muted">{v.row.home_site_name ?? "Not recorded"}</td><td><button onClick={() => openVehicle(v.row.vehicle_id)} className="ops-button" aria-label={"Open vehicle " + vehicleLabel(v.row)}>Open</button></td></tr>;
            })}</tbody>
          </table>
          {!filtered.length && <div className="py-12 text-center text-sm text-muted">No vehicles match. Clear the search or select another queue.</div>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span>{filtered.length ? NUM.format(safePage * PAGE_SIZE + 1) + "–" + NUM.format(Math.min((safePage + 1) * PAGE_SIZE, filtered.length)) : "0"} of {NUM.format(filtered.length)} vehicles</span>
          <div className="flex gap-2"><button className="ops-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><button className="ops-button" disabled={(safePage + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(safePage + 1)}>Next</button></div></div>
      </section>
      <p className="mt-6 text-xs leading-relaxed text-muted">Garage stages follow the loaded report and recorded reviews. Accident and repair notifications update when you import new records or report an incident here. Refresh source records before a live dispatch.</p>
    </>}
    {selected && <VehicleDialog key={engine.dataset + ":" + selected.row.vehicle_id + ":" + selected.revision} vehicle={selected} state={operations.state} context={context} change={operations.change} saving={operations.saving} error={operations.error}
      onClose={() => setSelectedId(null)} onIncident={() => { setIncidentFor(selected.row.vehicle_id); setSelectedId(null); }} />}
    {incidentFor !== undefined && <IncidentDialog rows={vehicles.map((v) => v.row)} preset={incidentFor ?? undefined} onClose={() => setIncidentFor(undefined)} change={operations.change} saving={operations.saving} error={operations.error} />}
    <Dialog.Root open={notifications} onOpenChange={setNotifications}><Dialog.Portal><Dialog.Overlay className="garage-overlay" /><Dialog.Content className="garage-dialog garage-notifications">
      <div className="flex items-center justify-between gap-3"><Dialog.Title className="text-2xl font-semibold">Garage alerts</Dialog.Title><Dialog.Close className="garage-icon-button" aria-label="Close alerts"><X size={20} /></Dialog.Close></div>
      <Dialog.Description className="mt-2 text-sm text-muted">{NUM.format(unread)} unread · {engine.region ?? "All regions"}. Reading an alert leaves the vehicle hold in place.</Dialog.Description>
      <div className="my-4 flex flex-wrap gap-2" aria-label="Alert types">{([["all", "All"], ["critical", "Critical holds"], ["ready", "Dispatch review"], ["warning", "Renewal / service"]] as const).map(([id, label]) =>
        <button key={id} className={"ops-chip " + (alertKind === id ? "ops-chip-active" : "")} aria-pressed={alertKind === id} onClick={() => { setAlertKind(id); setAlertPage(0); }}>{label}</button>)}</div>
      <div className="my-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted">{NUM.format(filteredAlerts.length)} alerts · page {safeAlertPage + 1} of {alertPages} · unread first</span><button className="ops-button" disabled={operations.saving || !visibleAlerts.length} onClick={() => void markRead(visibleAlerts)}>Mark shown as read</button></div>
      <div className="flex justify-end gap-2"><button aria-label="Previous alerts" className="ops-button" disabled={safeAlertPage === 0} onClick={() => setAlertPage(safeAlertPage - 1)}>Previous</button><button aria-label="Next alerts" className="ops-button" disabled={safeAlertPage + 1 >= alertPages} onClick={() => setAlertPage(safeAlertPage + 1)}>Next</button></div>
      <div className="divide-y divide-border">{visibleAlerts.map((a) => <div key={a.id} className={"garage-alert-row " + (acknowledged.has(a.id) ? "garage-alert-read" : "")}>
        <span className={"mt-1 " + (a.priority === "critical" ? "text-bad" : a.priority === "ready" ? "text-good" : "text-warn")}>{a.priority === "ready" ? <CheckCircle size={20} weight="fill" /> : <Warning size={20} weight="fill" />}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{a.title}</p><p className="mt-1 text-xs leading-relaxed text-muted">{a.detail}</p>
          <div className="mt-2 flex gap-3"><button className="text-xs font-medium text-accent" onClick={() => openVehicle(a.vehicleId)}>Open vehicle</button>{!acknowledged.has(a.id) ? <button className="text-xs text-muted" disabled={operations.saving} onClick={() => void markRead([a])}>Mark as read</button> : <span className="text-xs text-muted">Read</span>}</div></div>
      </div>)}</div>
      {!filteredAlerts.length && <div className="py-12 text-center"><ShieldCheck size={32} className="mx-auto text-good" /><p className="mt-3 text-sm">No alerts of this type in the loaded evidence for this scope.</p></div>}
      {operations.error && <p role="alert" className="mt-4 text-sm text-bad">{operations.error}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </Sparks>;
}
const RECOVERY_LABEL = { reported: "Assign assessment and protect the vehicle", assessment: "Assess damage and arrange repair", repair: "Complete repair work", quality: "Complete the safety checks", ready: "Review and record handover" };
function Pulse({ icon, value, label, color, onClick }: { icon: React.ReactNode; value: number; label: string; color: string; onClick: () => void }) {
  return <button className="garage-pulse-item" onClick={onClick}><span className="garage-pulse-icon" style={{ color }}>{icon}</span><span><b className="tnum">{NUM.format(value)}</b><span className="mt-0.5 block text-xs text-muted">{label}</span></span></button>;
}
function Mission({ title, text, count, total, color, onClick }: { title: string; text: string; count: number; total: number; color: string; onClick: () => void }) {
  const share = total ? Math.min(100, (100 * count) / total) : 0;
  return <button onClick={onClick} className="garage-mission">
    <span className="flex items-baseline justify-between gap-2"><b className="text-[13px] font-semibold">{title}</b><span className="tnum text-[13px] font-semibold" style={{ color: count ? color : "var(--good)" }}>{count ? NUM.format(count) + " left" : "Clear"}</span></span>
    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{text}</span>
    <span className="garage-mission-bar"><span style={{ width: (count ? Math.max(share, 2) : 0) + "%", background: color }} /></span>
  </button>;
}
const RANKS = [{ at: 0, name: "Crew starter" }, { at: 1, name: "Dispatcher" }, { at: 5, name: "Recovery crew" }, { at: 20, name: "Garage captain" }, { at: 50, name: "Fleet chief" }];
function crewLevel(handovers: number) {
  const i = RANKS.findLastIndex((r) => handovers >= r.at), cur = RANKS[i], nxt = RANKS[i + 1];
  return { name: cur.name, next: nxt?.name ?? null, toNext: nxt ? (nxt.at - handovers) * 50 : 0,
    pct: nxt ? Math.round((100 * (handovers - cur.at)) / (nxt.at - cur.at)) : 100 };
}

