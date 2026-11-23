"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { Chart, PALETTE, STATUS } from "@/components/chart";
import { useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton, StatStrip } from "@/components/ui";
import { Field, buttonCls, inputCls, money, primaryCls } from "@/components/service/fields";
import { OrderDialog } from "@/components/service/order-dialog";
import { useServiceBoard } from "@/components/service/use-service";
import { PAY_TYPES, STAGES, hoursInStage, orderTotals, payLabel, scheduleOrder, serviceReport, type PayType, type ServiceOrder, type Stage } from "@/lib/service";

const PAY_TONE: Record<PayType, string> = { customer: PALETTE[0], warranty: PALETTE[3], recall: STATUS.warn, retrofit: PALETTE[2] };

function OrderCard({ o, now, onOpen }: { o: ServiceOrder; now: string; onOpen: () => void }) {
  const t = orderTotals(o), h = hoursInStage(o, now);
  const missingClaim = o.stage === "diagnosis" && o.lines.some((l) => l.payType !== "customer" && !l.claimRef.trim());
  return (
    <button onClick={onOpen} className="w-full rounded-xl border border-border bg-panel p-3 text-left transition hover:border-accent focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-[0.99]">
      <p className="flex items-center justify-between gap-2"><span className="font-mono text-[13px] font-medium">{o.plate}</span><span className="tnum text-[11px] text-faint">{h < 24 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} d`}</span></p>
      <p className="truncate text-[12px] text-muted">{o.vehicleLabel}</p>
      <p className="mt-1.5 line-clamp-2 text-[12px]">{o.lines[0]?.concern}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {[...new Set(o.lines.map((l) => l.payType))].map((p) => (
          <span key={p} className="rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ background: `color-mix(in srgb, ${PAY_TONE[p]} 16%, transparent)`, color: "var(--text)" }}>{payLabel(p)}</span>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{o.assignedTo ? `Tech: ${o.assignedTo}` : `Advisor: ${o.advisor}`}{o.stage === "on_hold" ? ` · ${o.holdReason}` : ""}</p>
      {(t.actualHours > 0 || t.estimatedHours > 0) && <p className="tnum text-[11px] text-faint">{t.actualHours.toFixed(1)} / {t.estimatedHours.toFixed(1)} h</p>}
      {missingClaim && <p className="mt-1 text-[11px] font-semibold text-warn">Claim reference missing</p>}
    </button>
  );
}

function BookDialog({ onClose, onBook, technicians }: { onClose: () => void; onBook: (input: { vehicleId: string; plate: string; label: string; advisor: string; when: string; concern: string; payType: PayType }) => Promise<boolean>; technicians: string[] }) {
  const [search, setSearch] = useState(""), [choice, setChoice] = useState<{ vehicle_id: string; plate_number: string | null; make: string | null; model: string | null } | null>(null);
  const [advisor, setAdvisor] = useState(technicians[0] ?? ""), [when, setWhen] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 16));
  const [concern, setConcern] = useState(""), [payType, setPayType] = useState<PayType>("customer");
  const q = search.trim().replace(/'/g, "''").toUpperCase();
  const found = useSql<{ vehicle_id: string; plate_number: string | null; make: string | null; model: string | null }>(q.length >= 2
    ? `SELECT vehicle_id, plate_number, make, model FROM mart_fleet_registry WHERE upper(coalesce(plate_number, '') || ' ' || vehicle_id || ' ' || coalesce(vin, '')) LIKE '%${q}%' ORDER BY plate_number LIMIT 8` : null);
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal><Dialog.Overlay className="garage-overlay" /><Dialog.Content className="garage-dialog">
        <div className="flex items-start justify-between"><Dialog.Title className="text-xl font-semibold">Book a vehicle in</Dialog.Title><Dialog.Close aria-label="Close" className="garage-icon-button"><X size={18} /></Dialog.Close></div>
        <Dialog.Description className="mt-1 text-sm text-muted">The order starts at Scheduled. Check-in, tyres and the odometer are recorded when the vehicle arrives.</Dialog.Description>
        <div className="mt-4 grid gap-3">
          <Field label="Vehicle (plate, fleet no. or VIN)"><input className={inputCls} value={choice ? `${choice.plate_number ?? choice.vehicle_id} · ${[choice.make, choice.model].filter(Boolean).join(" ")}` : search}
            onChange={(e) => { setChoice(null); setSearch(e.target.value); }} placeholder="Type at least two characters" /></Field>
          {!choice && found.data && <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">{found.data.length === 0 && <li className="p-2 text-[12.5px] text-muted">No vehicle matches.</li>}
            {found.data.map((v) => <li key={v.vehicle_id}><button className="w-full px-3 py-2 text-left text-[13px] hover:bg-panel-2" onClick={() => setChoice(v)}><span className="font-mono">{v.plate_number ?? v.vehicle_id}</span> · {[v.make, v.model].filter(Boolean).join(" ")}</button></li>)}</ul>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Service advisor"><input className={inputCls} value={advisor} onChange={(e) => setAdvisor(e.target.value)} /></Field>
            <Field label="Booked for"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          </div>
          <Field label="Issue reported"><input className={inputCls} value={concern} onChange={(e) => setConcern(e.target.value)} /></Field>
          <Field label="Pay type"><select className={inputCls} value={payType} onChange={(e) => setPayType(e.target.value as PayType)}>{PAY_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={buttonCls} onClick={onClose}>Cancel</button>
          <button className={primaryCls} disabled={!choice || !advisor.trim() || concern.trim().length < 3}
            onClick={() => choice && void onBook({ vehicleId: choice.vehicle_id, plate: choice.plate_number ?? choice.vehicle_id, label: [choice.make, choice.model].filter(Boolean).join(" ") || choice.vehicle_id,
              advisor, when: new Date(when).toISOString(), concern, payType }).then((ok) => ok && onClose())}>Book in</button>
        </div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}

export default function ServicePage() {
  const board = useServiceBoard();
  const [openId, setOpenId] = useState<string | null>(null), [booking, setBooking] = useState(false), [stageFilter, setStageFilter] = useState<Stage | "open">("open");
  const now = useMemo(() => new Date().toISOString(), [board.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const report = board.state ? serviceReport(board.state, now) : null;
  const open = board.state?.orders.find((o) => o.id === openId) ?? null;
  const techEff = report && report.technicians.reduce((s, t) => s + t.hours, 0) > 0
    ? report.technicians.reduce((s, t) => s + t.estimated, 0) / report.technicians.reduce((s, t) => s + t.hours, 0) : null;

  return (
    <>
      <PageHeader eyebrow="Service board" title="Every vehicle in the workshop, stage by stage" art="workshop">
        From booking to delivery: who has each car, what was found, which hours and parts went in, how it is paid (customer, warranty, recall or
        retrofit), and the condition, tyres and odometer when it came in and went out.
      </PageHeader>
      <p className="as-of">{board.demo ? "Practice board · sample orders on the demo fleet · changes stay in this tab" : "Your service orders · saved on this device"}</p>

      {!report ? <Skeleton height={120} /> : (
        <div className="mt-6">
          <StatStrip items={[
            { label: "Open orders", value: report.open },
            { label: "On hold", value: report.onHold, status: report.onHold > report.open * 0.25 ? "amber" : undefined },
            { label: "Delivered, last 7 days", value: report.deliveredLast7 },
            { label: "Average time in workshop", value: report.avgDwellHours, unit: "h", decimals: 1 },
            { label: "Technician efficiency", value: techEff === null ? null : techEff * 100, unit: "%", status: techEff !== null && techEff < 0.85 ? "amber" : undefined },
            { label: "Claim numbers due", value: report.claimsMissingRef, status: report.claimsMissingRef ? "amber" : undefined },
            { label: "Customer-pay revenue ($)", value: Math.round(report.customerRevenue) },
          ]} />
        </div>
      )}

      <SectionTitle sub="Scheduled → Arrived → Service ready → On hold → In service → Diagnosis → Service complete → Delivered. Open a card for its full job sheet.">
        Board
      </SectionTitle>
      <div className="mb-3 flex justify-end">
        <button className={primaryCls} disabled={!board.canEdit} onClick={() => setBooking(true)}><Plus size={14} className="me-1" />Book a vehicle</button>
      </div>
      {board.error && <p role="alert" className="mb-3 text-sm text-bad">{board.error}</p>}
      {!board.state ? <Skeleton height={420} /> : board.state.orders.length === 0 ? (
        <Card><p className="text-sm text-muted">No service orders yet. Book a vehicle in to start its job sheet.</p></Card>
      ) : (
        <>
          {/* Phones: pick a stage, then a list. Wider screens: the full board. */}
          <div className="md:hidden">
            <div role="radiogroup" aria-label="Stage" className="mb-3 flex flex-wrap gap-1.5">
              {[{ id: "open" as const, label: "All open" }, ...STAGES].map((s) => (
                <button key={s.id} role="radio" aria-checked={stageFilter === s.id} onClick={() => setStageFilter(s.id)}
                  className={"min-h-11 rounded-full border px-3 text-[12.5px] " + (stageFilter === s.id ? "border-accent bg-accent-soft text-accent-ink" : "border-border text-muted")}>
                  {s.label} <span className="tnum">{s.id === "open" ? report!.open : report!.byStage[s.id]}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">{board.state.orders.filter((o) => (stageFilter === "open" ? o.stage !== "delivered" : o.stage === stageFilter)).map((o) => <OrderCard key={o.id} o={o} now={now} onOpen={() => setOpenId(o.id)} />)}</div>
          </div>
          <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
            {STAGES.map((s) => {
              const orders = board.state!.orders.filter((o) => o.stage === s.id).sort((a, b) => Date.parse(a.history.at(-1)!.at) - Date.parse(b.history.at(-1)!.at));
              return (
                <section key={s.id} aria-label={s.label} className="w-[220px] shrink-0 rounded-2xl border border-border bg-panel-2/60 p-2.5">
                  <h3 className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold">{s.label}<span className="garage-count tnum">{orders.length}</span></h3>
                  <div className="max-h-[560px] space-y-2 overflow-y-auto">
                    {orders.length === 0 && <p className="px-1 py-4 text-center text-[12px] text-faint">Empty</p>}
                    {orders.slice(0, s.id === "delivered" ? 12 : 50).map((o) => <OrderCard key={o.id} o={o} now={now} onOpen={() => setOpenId(o.id)} />)}
                    {s.id === "delivered" && orders.length > 12 && <p className="px-1 text-[11.5px] text-faint">+{orders.length - 12} older; open a vehicle&apos;s history for all visits</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {report && (
        <>
          <SectionTitle sub="Where the work is, who is doing it, and how it is paid">Reports</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Orders by stage">
              <Chart height={240} option={() => ({
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
                xAxis: { type: "value", minInterval: 1 }, yAxis: { type: "category", inverse: true, data: STAGES.map((s) => s.label) },
                series: [{ type: "bar", barWidth: "55%", data: STAGES.map((s) => ({ value: report.byStage[s.id], itemStyle: { color: s.id === "on_hold" ? STATUS.warn : PALETTE[0] } })) }],
              })} />
            </Card>
            <Card title="Charges by pay type" sub="All orders: labour at the billed hours plus parts">
              <Chart height={240} option={() => ({
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => money(Number(v)) }, grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
                xAxis: { type: "category", data: report.pay.map((p) => payLabel(p.payType)) }, yAxis: { type: "value" },
                series: [{ type: "bar", barWidth: "45%", data: report.pay.map((p) => ({ value: Math.round(p.total), itemStyle: { color: PAY_TONE[p.payType] } })) }],
              })} />
            </Card>
            <Card title="Technicians" sub="Hours logged against the estimate for the same work, and open orders assigned">
              <table className="tnum w-full text-[12.5px]">
                <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Technician</th><th className="text-right font-medium">Logged</th><th className="text-right font-medium">Estimated</th><th className="text-right font-medium">Efficiency</th><th className="text-right font-medium">Open</th></tr></thead>
                <tbody>{report.technicians.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted">No hours logged yet.</td></tr>}
                  {report.technicians.map((t) => (
                    <tr key={t.tech} className="border-t border-border"><td className="py-1.5">{t.tech}</td><td className="text-right">{t.hours.toFixed(1)} h</td><td className="text-right">{t.estimated.toFixed(1)} h</td>
                      <td className="text-right" style={{ color: t.efficiency !== null && t.efficiency < 0.85 ? "var(--warn)" : undefined }}>{t.efficiency === null ? "—" : `${(t.efficiency * 100).toFixed(0)}%`}{t.efficiency !== null && t.efficiency < 0.85 ? " · slow" : ""}</td><td className="text-right">{t.open}</td></tr>))}
                </tbody>
              </table>
            </Card>
            <Card title="Why orders are on hold" sub={`${report.onHold} order(s) waiting`}>
              <ul className="space-y-2 text-[13px]">
                {report.holdReasons.length === 0 && <li className="text-muted">Nothing on hold.</li>}
                {report.holdReasons.map((h) => <li key={h.reason} className="flex justify-between border-b border-border pb-1.5"><span>{h.reason}</span><span className="tnum font-medium">{h.orders}</span></li>)}
              </ul>
              <p className="mt-4 text-[12.5px] text-muted">Customer-pay revenue on delivered orders: <span className="tnum font-medium text-text">{money(report.customerRevenue)}</span></p>
            </Card>
          </div>
        </>
      )}

      {open && board.state && <OrderDialog key={open.id} order={open} state={board.state} change={board.change} saving={board.saving} error={board.error} canEdit={board.canEdit} onClose={() => { setOpenId(null); board.setError(null); }} />}
      {booking && <BookDialog technicians={board.state?.technicians ?? []} onClose={() => setBooking(false)}
        onBook={(b) => board.change((s) => scheduleOrder(s, { id: `SO-${Date.now().toString(36).toUpperCase()}`, vehicleId: b.vehicleId, plate: b.plate, vehicleLabel: b.label,
          advisor: b.advisor, scheduledFor: b.when, concern: b.concern, payType: b.payType }, new Date().toISOString()), `Service booked for ${b.plate}`)} />}
    </>
  );
}
