"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Plus, Trash, X } from "@phosphor-icons/react";
import {
  HOLD_REASONS, PAY_TYPES, TYRES, addComment, advanceOrder, holdOrder, needsClaim, nextStage, orderTotals, payLabel, stageBlockers, stageLabel, updateOrder,
  vehicleHistory, type ConditionCheck, type Role, type ServiceLine, type ServiceOrder, type ServiceState, type TyreState,
} from "@/lib/service";
import { Field, NumberInput, Section, buttonCls, inputCls, money, primaryCls, when } from "./fields";

type Change = (update: (s: ServiceState) => ServiceState, detail: string) => Promise<boolean>;
const TABS = ["Stages", "Check-in", "Work", "Time", "Comments", "Invoice", "History"] as const;
type Tab = (typeof TABS)[number];
const TYRE_STATES: TyreState[] = ["good", "worn", "damaged", "replace"];
const POS: Record<string, string> = { FL: "Front left", FR: "Front right", RL: "Rear left", RR: "Rear right" };
const now = () => new Date().toISOString();

export function OrderDialog({ order, state, change, saving, error, canEdit, onClose }: {
  order: ServiceOrder; state: ServiceState; change: Change; saving: boolean; error: string | null; canEdit: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Stages");
  const closed = order.stage === "delivered";
  const t = orderTotals(order);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal><Dialog.Overlay className="garage-overlay" />
        <Dialog.Content className="garage-dialog" style={{ width: "min(920px, calc(100vw - 32px))" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold text-accent-ink">{stageLabel(order.stage)}{order.stage === "on_hold" ? ` · ${order.holdReason}` : ""}</p>
              <Dialog.Title className="truncate text-2xl font-semibold"><span className="font-mono">{order.plate}</span> · {order.vehicleLabel}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {order.id} · advisor {order.advisor} · {order.assignedTo ? `assigned to ${order.assignedTo}` : "not assigned"} · {t.estimatedHours.toFixed(1)} h estimated, {t.actualHours.toFixed(1)} h logged
              </Dialog.Description>
            </div>
            <Dialog.Close disabled={saving} aria-label="Close the service order" className="garage-icon-button"><X size={20} /></Dialog.Close>
          </div>
          <div role="tablist" aria-label="Service order sections" className="mt-4 flex flex-wrap gap-1.5 border-b border-border pb-3">
            {TABS.map((x) => (
              <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
                className={"rounded-full px-3 py-1 text-[12.5px] transition " + (tab === x ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-text")}>{x}</button>
            ))}
          </div>
          {!canEdit && <p className="mt-3 text-[12px] text-faint">Read only while the live engine loads.</p>}
          {closed && <p className="mt-3 text-[12px] text-faint">Delivered: the order is closed. Comments can still be added.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
          <div className="mt-4">
            {tab === "Stages" && <Stages order={order} state={state} change={change} saving={saving} canEdit={canEdit} />}
            {tab === "Check-in" && <CheckIn key={order.updatedAt} order={order} change={change} saving={saving} disabled={!canEdit || closed} />}
            {tab === "Work" && <Work key={order.updatedAt} order={order} change={change} saving={saving} disabled={!canEdit || closed} />}
            {tab === "Time" && <Time order={order} state={state} change={change} saving={saving} disabled={!canEdit || closed} />}
            {tab === "Comments" && <Comments order={order} change={change} saving={saving} disabled={!canEdit} />}
            {tab === "Invoice" && <InvoiceTab key={order.updatedAt} order={order} change={change} saving={saving} disabled={!canEdit || closed} />}
            {tab === "History" && <History order={order} state={state} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stages({ order, state, change, saving, canEdit }: { order: ServiceOrder; state: ServiceState; change: Change; saving: boolean; canEdit: boolean }) {
  const next = nextStage(order);
  const [assignee, setAssignee] = useState(order.assignedTo), [by, setBy] = useState(order.assignedTo || order.advisor), [note, setNote] = useState("");
  const [reason, setReason] = useState<string>(HOLD_REASONS[0]);
  const blockers = next ? stageBlockers(order, assignee) : [];
  const canHold = !["scheduled", "on_hold", "delivered"].includes(order.stage);
  return (
    <div className="space-y-5">
      <Section title="Stage history" sub="Who moved the order, when, and who it was assigned to">
        <ol className="space-y-2">
          {order.history.map((h, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr] gap-3 text-[13px]">
              <span className="tnum text-faint">{when(h.at)}</span>
              <span><span className="font-medium">{stageLabel(h.stage)}</span>{h.assignedTo ? ` · assigned to ${h.assignedTo}` : ""}<span className="text-muted"> · by {h.by}</span>{h.note ? <span className="block text-muted">{h.note}</span> : null}</span>
            </li>
          ))}
        </ol>
      </Section>
      {next && (
        <Section title={order.stage === "on_hold" ? `Resume to ${stageLabel(next)}` : `Move to ${stageLabel(next)}`} sub="Each stage is assigned to a technician (or the advisor at arrival)">
          <datalist id="service-techs">{state.technicians.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Assigned to"><input list="service-techs" className={inputCls} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Moved by"><input className={inputCls} value={by} onChange={(e) => setBy(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Note (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} /></Field>
          </div>
          {blockers.length > 0 && <ul className="mt-3 space-y-1 text-[12.5px] text-warn">{blockers.map((b) => <li key={b}>• {b}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primaryCls} disabled={!canEdit || saving || blockers.length > 0}
              onClick={() => void change((s) => advanceOrder(s, order.id, { assignedTo: assignee, by, note }, now()), `Service ${order.id} moved to ${stageLabel(next)}`)}>
              {order.stage === "on_hold" ? "Resume" : `Move to ${stageLabel(next)}`}
            </button>
          </div>
        </Section>
      )}
      {canHold && (
        <Section title="Put on hold" sub="Waiting for parts, approval or a bay; the order returns to this stage when resumed">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Reason" className="min-w-[240px] flex-1"><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canEdit}>{HOLD_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <button className={buttonCls} disabled={!canEdit || saving} onClick={() => void change((s) => holdOrder(s, order.id, { reason, by, assignedTo: assignee }, now()), `Service ${order.id} on hold: ${reason}`)}>Put on hold</button>
          </div>
        </Section>
      )}
    </div>
  );
}

function blankCheck(by: string, km: number | null): ConditionCheck {
  return { at: now(), by, odometerKm: km ?? NaN, energyPct: null, exterior: "", interior: "", warningLights: "None", damage: false,
    tyres: TYRES.map((position) => ({ position, treadMm: null, pressurePsi: null, state: "" as const })) };
}

function CheckIn({ order, change, saving, disabled }: { order: ServiceOrder; change: Change; saving: boolean; disabled: boolean }) {
  const [inn, setIn] = useState<ConditionCheck>(order.checkIn ?? blankCheck(order.advisor, null));
  const [out, setOut] = useState<ConditionCheck | null>(order.checkOut);
  const canOut = ["service_complete", "delivered"].includes(order.stage) || !!order.checkOut;
  const save = () => change((s) => updateOrder(s, order.id, (o) => ({ ...o, checkIn: { ...inn, at: o.checkIn?.at ?? now() }, checkOut: out }), now()), `Service ${order.id}: condition recorded`);
  return (
    <div className="space-y-5">
      <ConditionForm title="Condition at arrival" sub="Odometer, energy, body, interior, warning lights and tyres when the vehicle is received" value={inn} onChange={setIn} disabled={disabled} />
      {canOut && (out
        ? <ConditionForm title="Condition at delivery" sub="Odometer out and condition when the vehicle leaves" value={out} onChange={setOut} disabled={disabled} />
        : <button className={buttonCls} disabled={disabled} onClick={() => setOut({ ...blankCheck(order.advisor, order.checkIn?.odometerKm ?? null), tyres: order.checkIn?.tyres ?? blankCheck("", null).tyres })}>Record condition at delivery</button>)}
      {order.checkIn && order.checkOut && <p className="text-[12.5px] text-muted">Driven while in the workshop: <span className="tnum font-medium text-text">{(order.checkOut.odometerKm - order.checkIn.odometerKm).toLocaleString()} km</span></p>}
      <button className={primaryCls} disabled={disabled || saving} onClick={() => void save()}>Save condition</button>
    </div>
  );
}

function ConditionForm({ title, sub, value: c, onChange, disabled }: { title: string; sub: string; value: ConditionCheck; onChange: (c: ConditionCheck) => void; disabled: boolean }) {
  const set = (p: Partial<ConditionCheck>) => onChange({ ...c, ...p });
  return (
    <Section title={title} sub={sub}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Odometer (km)"><NumberInput value={Number.isFinite(c.odometerKm) ? c.odometerKm : null} onChange={(v) => set({ odometerKm: v ?? NaN })} min={0} disabled={disabled} /></Field>
        <Field label="Fuel / charge %"><NumberInput value={c.energyPct} onChange={(v) => set({ energyPct: v })} min={0} max={100} disabled={disabled} /></Field>
        <Field label="Recorded by"><input className={inputCls} value={c.by} onChange={(e) => set({ by: e.target.value })} disabled={disabled} /></Field>
        <Field label="Warning lights"><input className={inputCls} value={c.warningLights} onChange={(e) => set({ warningLights: e.target.value })} disabled={disabled} /></Field>
        <Field label="Exterior" className="sm:col-span-2"><input className={inputCls} value={c.exterior} onChange={(e) => set({ exterior: e.target.value })} disabled={disabled} placeholder="Scratches, dents, chips…" /></Field>
        <Field label="Interior" className="sm:col-span-2"><input className={inputCls} value={c.interior} onChange={(e) => set({ interior: e.target.value })} disabled={disabled} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={c.damage} onChange={(e) => set({ damage: e.target.checked })} disabled={disabled} /> New damage noted with the customer</label>
      <div className="mt-3 overflow-x-auto">
        <table className="tnum w-full min-w-[440px] text-[12.5px]">
          <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Tyre</th><th className="font-medium">Tread (mm)</th><th className="font-medium">Pressure (psi)</th><th className="font-medium">Condition</th></tr></thead>
          <tbody>{c.tyres.map((t, i) => (
            <tr key={t.position} className="border-t border-border">
              <td className="py-1.5">{POS[t.position]}</td>
              <td className="pr-2"><NumberInput value={t.treadMm} step={0.1} min={0} max={20} disabled={disabled} onChange={(v) => set({ tyres: c.tyres.map((x, j) => (j === i ? { ...x, treadMm: v } : x)) })} /></td>
              <td className="pr-2"><NumberInput value={t.pressurePsi} min={0} max={150} disabled={disabled} onChange={(v) => set({ tyres: c.tyres.map((x, j) => (j === i ? { ...x, pressurePsi: v } : x)) })} /></td>
              <td><select className={inputCls} value={t.state} disabled={disabled} onChange={(e) => set({ tyres: c.tyres.map((x, j) => (j === i ? { ...x, state: e.target.value as TyreState } : x)) })}>
                <option value="">Not checked</option>{TYRE_STATES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Work({ order, change, saving, disabled }: { order: ServiceOrder; change: Change; saving: boolean; disabled: boolean }) {
  const [lines, setLines] = useState<ServiceLine[]>(order.lines);
  const set = (i: number, p: Partial<ServiceLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const save = () => change((s) => updateOrder(s, order.id, (o) => ({ ...o, lines }), now()), `Service ${order.id}: work lines updated`);
  return (
    <div className="space-y-5">
      {lines.map((l, i) => (
        <Section key={l.id} title={`Line ${i + 1} · ${payLabel(l.payType)}`} sub="The issue, what was found, what was done, how it is paid and the parts changed"
          right={lines.length > 1 && !disabled ? <button aria-label={`Remove line ${i + 1}`} className="garage-icon-button" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash size={16} /></button> : null}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pay type"><select className={inputCls} value={l.payType} disabled={disabled} onChange={(e) => set(i, { payType: e.target.value as ServiceLine["payType"] })}>{PAY_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label={needsClaim(l.payType) ? `${payLabel(l.payType)} claim / campaign no.` : "Claim reference"} hint={needsClaim(l.payType) ? "Required before the job can be completed" : "Not needed for customer pay"}>
              <input className={inputCls} value={l.claimRef} disabled={disabled || !needsClaim(l.payType)} onChange={(e) => set(i, { claimRef: e.target.value })} /></Field>
            <Field label="Estimated labour (h)"><NumberInput value={l.estimatedHours} step={0.1} min={0} disabled={disabled} onChange={(v) => set(i, { estimatedHours: v ?? 0 })} /></Field>
            <Field label="Issue reported" className="sm:col-span-3"><input className={inputCls} value={l.concern} disabled={disabled} onChange={(e) => set(i, { concern: e.target.value })} /></Field>
            <Field label="Diagnosis" className="sm:col-span-3"><textarea rows={2} className={inputCls} value={l.diagnosis} disabled={disabled} onChange={(e) => set(i, { diagnosis: e.target.value })} /></Field>
            <Field label="Work done" className="sm:col-span-3"><textarea rows={2} className={inputCls} value={l.correction} disabled={disabled} onChange={(e) => set(i, { correction: e.target.value })} /></Field>
          </div>
          <p className="mb-1 mt-3 text-[12px] font-medium">Parts changed</p>
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[520px] text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Part no.</th><th className="font-medium">Description</th><th className="w-20 font-medium">Qty</th><th className="w-28 font-medium">Unit price</th><th /></tr></thead>
              <tbody>
                {l.parts.length === 0 && <tr><td colSpan={5} className="py-2 text-muted">No parts on this line.</td></tr>}
                {l.parts.map((p, k) => {
                  const setPart = (patch: Partial<typeof p>) => set(i, { parts: l.parts.map((x, m) => (m === k ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-1 pr-2"><input className={inputCls + " font-mono"} value={p.partNumber} disabled={disabled} onChange={(e) => setPart({ partNumber: e.target.value })} /></td>
                      <td className="pr-2"><input className={inputCls} value={p.description} disabled={disabled} onChange={(e) => setPart({ description: e.target.value })} /></td>
                      <td className="pr-2"><NumberInput value={p.qty} min={1} disabled={disabled} onChange={(v) => setPart({ qty: v ?? 0 })} /></td>
                      <td className="pr-2"><NumberInput value={p.unitPrice} step={0.01} min={0} disabled={disabled} onChange={(v) => setPart({ unitPrice: v ?? 0 })} /></td>
                      <td>{!disabled && <button aria-label="Remove part" className="garage-icon-button" onClick={() => set(i, { parts: l.parts.filter((_, m) => m !== k) })}><Trash size={14} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!disabled && <button className={buttonCls + " mt-2"} onClick={() => set(i, { parts: [...l.parts, { id: `${l.id}-P${Date.now().toString(36)}`, partNumber: "", description: "", qty: 1, unitPrice: 0 }] })}><Plus size={14} className="me-1" />Add part</button>}
        </Section>
      ))}
      {!disabled && <div className="flex flex-wrap gap-2">
        <button className={buttonCls} onClick={() => setLines([...lines, { id: `${order.id}-L${Date.now().toString(36)}`, payType: "customer", concern: "", diagnosis: "", correction: "", claimRef: "", estimatedHours: 0, parts: [] }])}><Plus size={14} className="me-1" />Add line</button>
        <button className={primaryCls} disabled={saving} onClick={() => void save()}>Save work</button>
      </div>}
    </div>
  );
}

function Time({ order, state, change, saving, disabled }: { order: ServiceOrder; state: ServiceState; change: Change; saving: boolean; disabled: boolean }) {
  const [tech, setTech] = useState(order.assignedTo), [lineId, setLineId] = useState(order.lines[0]?.id ?? ""), [hours, setHours] = useState<number | null>(null), [note, setNote] = useState("");
  const t = orderTotals(order);
  const add = () => change((s) => updateOrder(s, order.id, (o) => ({ ...o, time: [...o.time, { id: `${o.id}-T${o.time.length + 1}`, tech, lineId: lineId || null, hours: hours ?? 0, at: now(), note }] }), now()), `Service ${order.id}: ${hours} h logged by ${tech}`);
  return (
    <div className="space-y-5">
      <Section title="Technician hours" sub={`${t.actualHours.toFixed(1)} h logged against ${t.estimatedHours.toFixed(1)} h estimated${t.efficiency ? ` · efficiency ${(t.efficiency * 100).toFixed(0)}%` : ""}`}>
        <table className="tnum w-full text-[12.5px]">
          <thead className="text-left text-faint"><tr><th className="py-1 font-medium">When</th><th className="font-medium">Technician</th><th className="font-medium">Line</th><th className="text-right font-medium">Hours</th></tr></thead>
          <tbody>
            {order.time.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">No hours logged yet.</td></tr>}
            {order.time.map((e) => <tr key={e.id} className="border-t border-border"><td className="py-1.5">{when(e.at)}</td><td>{e.tech}</td><td>{e.lineId ? `Line ${order.lines.findIndex((l) => l.id === e.lineId) + 1}` : "General"}</td><td className="text-right">{e.hours.toFixed(1)}</td></tr>)}
          </tbody>
        </table>
      </Section>
      {!disabled && (
        <Section title="Log hours">
          <datalist id="service-techs-time">{state.technicians.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Technician"><input list="service-techs-time" className={inputCls} value={tech} onChange={(e) => setTech(e.target.value)} /></Field>
            <Field label="Line"><select className={inputCls} value={lineId} onChange={(e) => setLineId(e.target.value)}><option value="">General</option>{order.lines.map((l, i) => <option key={l.id} value={l.id}>Line {i + 1}</option>)}</select></Field>
            <Field label="Hours"><NumberInput value={hours} step={0.1} min={0.1} max={24} onChange={setHours} /></Field>
            <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <button className={primaryCls + " mt-3"} disabled={saving || !tech.trim() || !(hours && hours > 0)} onClick={() => void add()}>Log hours</button>
        </Section>
      )}
    </div>
  );
}

function Comments({ order, change, saving, disabled }: { order: ServiceOrder; change: Change; saving: boolean; disabled: boolean }) {
  const [author, setAuthor] = useState(order.advisor), [role, setRole] = useState<Role>("advisor"), [textValue, setText] = useState("");
  return (
    <div className="space-y-5">
      <Section title="Comments" sub="Notes from technicians, the advisor and the owner for anyone who picks the vehicle up next">
        <ul className="space-y-3">
          {order.comments.length === 0 && <li className="text-[13px] text-muted">No comments yet.</li>}
          {order.comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border p-3 text-[13px]">
              <p className="text-[11.5px] text-faint"><span className="font-medium text-accent-ink">{c.role[0].toUpperCase() + c.role.slice(1)}</span> · {c.author} · {when(c.at)}</p>
              <p className="mt-1">{c.text}</p>
            </li>
          ))}
        </ul>
      </Section>
      {!disabled && (
        <Section title="Add a comment">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Author"><input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
            <Field label="Role"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="technician">Technician</option><option value="advisor">Advisor</option><option value="owner">Owner</option></select></Field>
          </div>
          <textarea rows={3} className={inputCls + " mt-3"} value={textValue} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
          <button className={primaryCls + " mt-3"} disabled={saving || textValue.trim().length < 2}
            onClick={() => void change((s) => addComment(s, order.id, { author, role, text: textValue }, now()), `Service ${order.id}: comment added`).then((ok) => ok && setText(""))}>Add comment</button>
        </Section>
      )}
    </div>
  );
}

function InvoiceTab({ order, change, saving, disabled }: { order: ServiceOrder; change: Change; saving: boolean; disabled: boolean }) {
  const [inv, setInv] = useState(order.invoice);
  const t = orderTotals({ ...order, invoice: inv });
  return (
    <div className="space-y-5">
      <Section title="Invoice" sub="Labour is billed at the estimated (flat-rate) hours, or the logged hours when no estimate is set">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Invoice no."><input className={inputCls + " font-mono"} value={inv.number} disabled={disabled} onChange={(e) => setInv({ ...inv, number: e.target.value })} /></Field>
          <Field label="Status"><select className={inputCls} value={inv.status} disabled={disabled} onChange={(e) => setInv({ ...inv, status: e.target.value as typeof inv.status, issuedAt: e.target.value === "draft" ? "" : inv.issuedAt || now() })}><option value="draft">Draft</option><option value="issued">Issued</option><option value="paid">Paid</option></select></Field>
          <Field label="Labour rate ($/h)"><NumberInput value={inv.labourRate} min={0} disabled={disabled} onChange={(v) => setInv({ ...inv, labourRate: v ?? 0 })} /></Field>
        </div>
      </Section>
      <Section title="Charges by pay type">
        <table className="tnum w-full text-[13px]">
          <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Pay type</th><th className="text-right font-medium">Labour</th><th className="text-right font-medium">Parts</th><th className="text-right font-medium">Total</th></tr></thead>
          <tbody>{PAY_TYPES.filter((p) => order.lines.some((l) => l.payType === p.id)).map((p) => (
            <tr key={p.id} className="border-t border-border"><td className="py-1.5">{p.label}</td><td className="text-right">{money(t.byPay[p.id].labour)}</td><td className="text-right">{money(t.byPay[p.id].parts)}</td><td className="text-right font-medium">{money(t.byPay[p.id].total)}</td></tr>))}
          </tbody>
        </table>
        <p className="mt-3 text-[13px]">Customer pays <span className="tnum font-semibold">{money(t.customerTotal)}</span> · claimed from warranty, recall and retrofit <span className="tnum font-semibold">{money(t.claimTotal)}</span> · {t.partsCount} part(s)</p>
      </Section>
      {!disabled && <button className={primaryCls} disabled={saving} onClick={() => void change((s) => updateOrder(s, order.id, (o) => ({ ...o, invoice: inv }), now()), `Service ${order.id}: invoice ${inv.status}`)}>Save invoice</button>}
    </div>
  );
}

function History({ order, state }: { order: ServiceOrder; state: ServiceState }) {
  const visits = vehicleHistory(state, order.vehicleId);
  return (
    <Section title={`Service history · ${order.plate}`} sub="Every visit of this vehicle: odometer in and out, tyres at arrival, pay types and charges">
      <div className="overflow-x-auto">
        <table className="tnum w-full min-w-[620px] text-[12.5px]">
          <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Booked</th><th className="font-medium">Order</th><th className="font-medium">Stage</th><th className="text-right font-medium">Odometer in → out</th><th className="font-medium">Lowest tread</th><th className="font-medium">Work</th><th className="text-right font-medium">Customer</th></tr></thead>
          <tbody>{visits.map((v) => {
            const treads = v.tyres.map((t) => t.treadMm).filter((x): x is number => x !== null);
            return (
              <tr key={v.order.id} className={"border-t border-border align-top" + (v.order.id === order.id ? " bg-accent-soft/40" : "")}>
                <td className="py-1.5">{new Date(v.order.scheduledFor).toLocaleDateString()}</td><td className="font-mono">{v.order.id}</td><td>{stageLabel(v.order.stage)}</td>
                <td className="text-right">{v.odometerIn?.toLocaleString() ?? "—"} → {v.odometerOut?.toLocaleString() ?? "—"}</td>
                <td>{treads.length ? `${Math.min(...treads).toFixed(1)} mm` : "—"}</td>
                <td className="text-muted">{v.order.lines.map((l) => `${payLabel(l.payType)}: ${l.concern}`).join("; ")}</td>
                <td className="text-right">{money(v.totals.customerTotal)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </Section>
  );
}
