"use client";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { CheckCircle, Clock, FileText, LockSimple, Warning, X } from "@phosphor-icons/react";
import { CHECKS, LANES, RECOVERY_STAGES, advanceIncident, localDate, recordHandover, releaseBlockers, saveGarageReview, sourceGates, vehicleLabel,
  type GarageContext, type GarageReview, type GarageState, type GarageVehicle, type PaperworkStage } from "@/lib/garage";
import { GarageCar } from "./car";

type Change = (update: (state: GarageState) => GarageState) => Promise<boolean>;
const labelDate = (date: string | null) => date ? date.slice(0, 16).replace("T", " ") : "Not recorded";
export function VehicleDialog({ vehicle, state, context, change, saving, error, onClose, onIncident }: {
  vehicle: GarageVehicle; state: GarageState; context: GarageContext; change: Change; saving: boolean;
  error: string | null; onClose: () => void; onIncident: () => void;
}) {
  const [draft, setDraft] = useState<GarageReview>(() => vehicle.review);
  const [message, setMessage] = useState("");
  const r = vehicle.row, lane = LANES.find((l) => l.id === vehicle.lane)!;
  const current = { ...context, today: localDate() };
  const gates = sourceGates(r, current, true);
  const blockers = releaseBlockers(r, state, current, draft);
  const done = gates.filter((g) => g.status === "pass").length + CHECKS.filter((c) => draft.checks[c.id]).length;
  const total = gates.length + CHECKS.length;
  const dirty = JSON.stringify({ ...draft, updatedAt: "" }) !== JSON.stringify({ ...vehicle.review, updatedAt: "" });
  const recoveryIndex = vehicle.incident ? RECOVERY_STAGES.findIndex((s) => s.id === vehicle.incident!.stage) : -1;
  const canCheck = !vehicle.incident || recoveryIndex >= 3;
  const save = async () => {
    const at = new Date().toISOString();
    if (await change((s) => saveGarageReview(s, r, current, draft, at))) { setDraft({ ...draft, updatedAt: at }); setMessage(context.demo ? "Practice review saved for this tab." : "Review saved with your fleet."); }
  };
  const nextStage = async () => {
    if (!vehicle.incident) return;
    const at = new Date().toISOString();
    if (await change((s) => advanceIncident(saveGarageReview(s, r, current, draft, at), vehicle.incident!.id, at))) setMessage("Recovery stage updated.");
  };
  const handover = async () => {
    const at = new Date().toISOString();
    if (await change((s) => recordHandover(s, r, { ...current, today: localDate() }, draft, at))) setMessage(context.demo ? "Practice handover completed. This vehicle's recovery is recorded." : "Handover recorded with reviewer and timestamp.");
  };
  const handovers = state.handovers.filter((h) => h.vehicleId === r.vehicle_id).slice(0, 4);
  const oldReview = state.reviews[r.vehicle_id];
  const history = [...(state.reviewHistory ?? []).filter((h) => h.vehicleId === r.vehicle_id),
    ...(oldReview && oldReview.revision !== vehicle.revision ? [{ vehicleId: r.vehicle_id, review: oldReview, archivedAt: oldReview.updatedAt, reason: "Earlier source evidence" }] : [])];
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="garage-overlay" /><Dialog.Content className="garage-dialog garage-vehicle-dialog">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4"><div className="garage-portrait"><GarageCar color={lane.color} small /></div><div className="min-w-0">
          <p className="mb-1 text-xs font-semibold" style={{ color: lane.color }}>{lane.label}</p>
          <Dialog.Title className="truncate text-2xl font-semibold">{vehicleLabel(r)}</Dialog.Title>
          <p className="mt-1 text-sm text-muted">{[r.make, r.model, r.model_year].filter(Boolean).join(" ")} · {r.vehicle_id}</p>
        </div></div>
        <Dialog.Close disabled={saving} aria-label="Close vehicle details" className="garage-icon-button"><X size={20} /></Dialog.Close>
      </div>
      <Dialog.Description className="mt-3 text-sm text-muted">{r.home_site_name ?? "Site not recorded"} · {r.region ?? "Region not recorded"} · Evidence dated {context.snapshot.slice(0, 10) || "unknown"}. {context.demo ? "Demo actions are practice only." : "Handover checks use current expiry dates."}</Dialog.Description>

      <section className="garage-readiness-panel mt-5" aria-label="Vehicle readiness">
        <div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold">Road checklist</h3><span className="tnum text-sm font-semibold">{done} / {total} checks</span></div>
        <progress className="garage-progress mt-3" aria-label="Road checklist progress" value={done} max={total} />
        <p className="mt-2 text-xs leading-relaxed text-muted">{vehicle.released ? "Handover recorded for this source revision." : blockers.length ? blockers.length + " requirement(s) remain before handover." : "Checks complete. A named reviewer can record the handover."} Physical checks and source records determine readiness.</p>
      </section>

      {vehicle.incident && <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">Accident recovery</h3><span className="text-xs text-muted">Owner: {vehicle.incident.owner}</span></div>
        <p className="mt-2 rounded-lg border border-bad/30 bg-bad/5 p-3 text-sm">{vehicle.incident.summary}</p>
        <ol className="garage-stages mt-4">{RECOVERY_STAGES.map((s, i) => <li key={s.id} className={i <= recoveryIndex ? "garage-stage-done" : ""}>
          <span className="garage-stage-dot">{i < recoveryIndex ? <CheckCircle size={15} weight="fill" /> : i + 1}</span><span>{s.label}</span>
        </li>)}</ol>
        {recoveryIndex < 4 && <button disabled={saving} className="ops-button mt-3" onClick={() => void nextStage()}>Move to {RECOVERY_STAGES[recoveryIndex + 1].label.toLowerCase()}</button>}
      </section>}

      {r.work_order_id && <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">Repair milestones</h3><span className="text-xs text-muted">{r.work_order_id} · {r.job_type}</span></div>
        <div className="mt-3 flex items-center gap-3"><progress className="garage-progress" value={vehicle.milestones.filter((m) => m.at).length} max={5} aria-label="Recorded repair milestones" /><span className="shrink-0 text-xs text-muted">{vehicle.milestones.filter((m) => m.at).length} / 5 recorded</span></div>
        <ol className="garage-milestones mt-3">{vehicle.milestones.map((m) => <li key={m.label} className={m.at ? "garage-milestone-recorded" : ""}>
          {m.at ? <CheckCircle size={17} weight="fill" /> : <Clock size={17} />}<span><b>{m.label}</b><small>{labelDate(m.at)}</small></span>
        </li>)}</ol>
        {r.open_jobs > 0 && <p className="mt-2 text-xs text-warn">{r.open_jobs} open order(s) in total; {r.unfinished_jobs} not marked repair-ready. Close every order in the source system before handover.</p>}
      </section>}

      <section className="mt-6">
        <h3 className="text-base font-semibold">Registration and insurance stages</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{(["registration", "insurance"] as const).map((kind) => {
          const gate = gates.find((g) => g.id === kind)!;
          const stage = gate.status === "pass" ? 3 : { not_started: 0, submitted: 1, received: 2 }[draft.paperwork[kind]];
          return <div key={kind} className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><FileText size={17} />{kind === "registration" ? "Registration" : "Insurance"}</p>
            <p className="mt-1 text-xs text-muted">{gate.detail}</p>
            <ol className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">{["Needed", "Submitted", "Received", "In date"].map((s, i) => <li key={s}>
              <span className={"mb-1 block h-1 rounded-full " + (i <= stage ? "bg-accent" : "bg-border")} />{s}</li>)}</ol>
            {gate.status !== "pass" && <label className="garage-field mt-3 text-xs">Renewal progress<select value={draft.paperwork[kind]} disabled={saving} onChange={(e) => setDraft({ ...draft, paperwork: { ...draft.paperwork, [kind]: e.target.value as PaperworkStage } })} className="ops-input mt-1 text-xs">
              <option value="not_started">Not started</option><option value="submitted">Renewal submitted</option><option value="received">Renewed document received</option>
            </select></label>}
            <Link href="/documents/" className="mt-3 inline-block text-xs font-medium text-accent hover:underline">Open document vault</Link>
          </div>;
        })}</div>
        <p className="mt-2 text-xs text-muted">Renewal progress tracks the task. Confirmed source expiry dates determine whether a document is current.</p>
      </section>

      <section className="mt-6"><h3 className="text-base font-semibold">Source requirements</h3>
        <ul className="mt-2 divide-y divide-border">{gates.map((g) => <li key={g.id} className="flex items-start gap-3 py-3">
          <span className={g.status === "pass" ? "text-good" : g.status === "blocked" ? "text-bad" : "text-warn"}>{g.status === "pass" ? <CheckCircle weight="fill" size={20} /> : g.status === "blocked" ? <LockSimple size={20} /> : <Warning size={20} />}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{g.label}<span className="ml-2 text-xs font-normal text-muted">{g.status === "pass" ? "Passed" : g.status === "blocked" ? "Blocked" : "Verify"}</span></p><p className="mt-0.5 text-xs text-muted">{g.detail}</p></div>
          {g.status !== "pass" && <Link href={g.href} className="shrink-0 text-xs font-medium text-accent">Review</Link>}
        </li>)}</ul>
      </section>

      <section className="mt-5"><h3 className="text-base font-semibold">Release checks</h3>
        {!canCheck && <p className="mt-2 text-xs text-warn">Move accident recovery to Quality checks before signing off release checks.</p>}
        <div className="mt-2 divide-y divide-border">{CHECKS.map((c) => <label key={c.id} className="flex cursor-pointer items-start gap-3 py-3">
          <input type="checkbox" checked={draft.checks[c.id]} disabled={saving || !canCheck || vehicle.released} onChange={(e) => setDraft({ ...draft, checks: { ...draft.checks, [c.id]: e.target.checked } })} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
          <span><b className="text-sm font-medium">{c.label}</b><span className="mt-0.5 block text-xs leading-relaxed text-muted">{c.detail}</span></span>
        </label>)}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="garage-field">Review owner<input value={draft.owner} disabled={saving} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} maxLength={120} placeholder="Named reviewer" className="ops-input" /></label>
          <label className="garage-field">Target return date<input value={draft.due} disabled={saving} onChange={(e) => setDraft({ ...draft, due: e.target.value })} type="date" className="ops-input" /></label>
        </div>
        <label className="garage-field mt-4">Review notes<textarea value={draft.notes} disabled={saving} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={2000} placeholder="Job reference, checks performed, next action and evidence" className="ops-input min-h-24" /></label>
      </section>
      {blockers.length > 0 && <details className="mt-4 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{blockers.length} handover blocker(s)</summary><ul id="handover-blockers" className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{blockers.map((s) => <li key={s}>{s}</li>)}</ul></details>}
      {(error || message || vehicle.released) && <p role={error ? "alert" : "status"} className={"mt-4 text-sm " + (error ? "text-bad" : "text-good")}>{error || (vehicle.released ? context.demo ? "Practice handover completed. This vehicle's recovery is recorded." : "Handover recorded with reviewer and timestamp." : message)}</p>}
      <div className="garage-dialog-footer mt-5">
        <p className="text-xs text-muted">{dirty ? "Review has unsaved changes." : context.demo ? "Practice actions stay in this tab." : "Saved actions stay with your fleet on this device."}</p>
        <div className="flex flex-wrap gap-2"><button disabled={saving || !dirty} onClick={() => void save()} className="ops-button">{saving ? "Saving…" : "Save review"}</button>
          <button disabled={saving || blockers.length > 0 || vehicle.released} onClick={() => void handover()} className="garage-primary">{vehicle.released ? "Handover recorded" : context.demo ? "Practice handover" : "Record handover"}</button></div>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-3 text-xs">
        <Link href="/doctrine/#SOP-03" className="text-accent hover:underline">Open recovery procedure</Link>
        {!vehicle.incident && <button disabled={saving} onClick={onIncident} className="font-medium text-bad">Report accident for this vehicle</button>}
      </div>
      {handovers.length > 0 && <section className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">Recent recorded handovers</h3>{handovers.map((h) => <div key={h.id} className="mt-3 rounded-lg border border-border p-3 text-xs text-muted">
        <p className="font-medium text-text">{h.reviewer} · {labelDate(h.at)}</p><p className="mt-1">Source {h.snapshot.slice(0, 10)} · release checks and source gates recorded</p>{h.review?.notes && <p className="mt-2 whitespace-pre-wrap">{h.review.notes}</p>}
      </div>)}</section>}
      {history.length > 0 && <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Previous review evidence ({history.length})</summary>
        {history.map((h, i) => <div key={i} className="mt-3 rounded-lg border border-border p-3 text-xs text-muted"><p className="font-medium text-text">{h.reason} · {labelDate(h.archivedAt || null)}</p>
          <p className="mt-1">{h.review.owner || "Owner not recorded"} · {CHECKS.filter((c) => h.review.checks[c.id]).length} / 3 release checks</p>{h.review.notes && <p className="mt-2 whitespace-pre-wrap">{h.review.notes}</p>}</div>)}
      </details>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
