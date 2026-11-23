/**
 * Service board: repair orders from booking to delivery. Pure functions over ServiceState; the engine provider saves
 * owner state through the sealed workspace and keeps demo state in tab memory.
 *
 * Sequence: Scheduled → Arrived → Service ready → (On hold) → In service → Diagnosis → Service complete → Delivered.
 * "On hold" is a waiting state (parts, approval, bay): it can be entered from any active stage with a reason and
 * resumes to the stage it came from. Every move records who did it, when, and the technician it is assigned to.
 */

export const STAGES = [
  { id: "scheduled", label: "Scheduled" },
  { id: "arrived", label: "Arrived" },
  { id: "service_ready", label: "Service ready" },
  { id: "on_hold", label: "On hold" },
  { id: "in_service", label: "In service" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "service_complete", label: "Service complete" },
  { id: "delivered", label: "Delivered" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];
/** The working path; On hold sits beside it rather than on it. */
const PATH: Stage[] = ["scheduled", "arrived", "service_ready", "in_service", "diagnosis", "service_complete", "delivered"];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)!.label;

export const PAY_TYPES = [
  { id: "customer", label: "Customer pay" },
  { id: "warranty", label: "Warranty" },
  { id: "recall", label: "Recall" },
  { id: "retrofit", label: "Retrofit" },
] as const;
export type PayType = (typeof PAY_TYPES)[number]["id"];
export const payLabel = (p: PayType) => PAY_TYPES.find((x) => x.id === p)!.label;
/** Pay types the manufacturer or campaign pays for: they need a claim or campaign reference. */
export const needsClaim = (p: PayType) => p !== "customer";

export const HOLD_REASONS = ["Waiting for parts", "Waiting for customer approval", "Waiting for warranty approval", "Waiting for a bay", "Waiting for a specialist", "Other"] as const;
export type Role = "technician" | "advisor" | "owner";
export type TyrePosition = "FL" | "FR" | "RL" | "RR";
export const TYRES: TyrePosition[] = ["FL", "FR", "RL", "RR"];
export type TyreState = "good" | "worn" | "damaged" | "replace";

export interface TyreCheck { position: TyrePosition; treadMm: number | null; pressurePsi: number | null; state: TyreState | "" }
export interface ConditionCheck {
  at: string; by: string; odometerKm: number; energyPct: number | null;   // fuel or charge level
  exterior: string; interior: string; warningLights: string; damage: boolean; tyres: TyreCheck[];
}
export interface Part { id: string; partNumber: string; description: string; qty: number; unitPrice: number }
export interface ServiceLine {
  id: string; payType: PayType; concern: string; diagnosis: string; correction: string;
  claimRef: string;          // warranty claim, recall or retrofit campaign number
  estimatedHours: number; parts: Part[];
}
export interface TimeEntry { id: string; tech: string; lineId: string | null; hours: number; at: string; note: string }
export interface StageEvent { stage: Stage; at: string; by: string; assignedTo: string; note: string }
export interface Comment { id: string; at: string; author: string; role: Role; text: string }
export interface Invoice { number: string; status: "draft" | "issued" | "paid"; labourRate: number; issuedAt: string }
export interface ServiceOrder {
  id: string; vehicleId: string; plate: string; vehicleLabel: string; advisor: string; scheduledFor: string;
  stage: Stage; heldFrom: Stage | null; holdReason: string; assignedTo: string;
  history: StageEvent[]; checkIn: ConditionCheck | null; checkOut: ConditionCheck | null;
  lines: ServiceLine[]; time: TimeEntry[]; comments: Comment[]; invoice: Invoice;
  createdAt: string; updatedAt: string;
}
export interface ServiceState { version: 1; orders: ServiceOrder[]; technicians: string[] }

export const emptyService = (): ServiceState => ({ version: 1, orders: [], technicians: [] });
export const DEFAULT_LABOUR_RATE = 95;

const validTime = (s: string) => typeof s === "string" && Number.isFinite(Date.parse(s));
const text = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const find = (state: ServiceState, id: string) => {
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new Error("This service order no longer exists.");
  return order;
};
const replace = (state: ServiceState, next: ServiceOrder): ServiceState =>
  ({ ...state, orders: state.orders.map((o) => (o.id === next.id ? next : o)) });

/** Book a vehicle in. */
export function scheduleOrder(state: ServiceState, input: { id: string; vehicleId: string; plate: string; vehicleLabel: string; advisor: string; scheduledFor: string; concern: string; payType: PayType }, at: string): ServiceState {
  if (!input.vehicleId || !text(input.advisor) || !validTime(input.scheduledFor) || text(input.concern).length < 3)
    throw new Error("Choose a vehicle, name the advisor, set the booking time and describe the concern.");
  if (state.orders.some((o) => o.id === input.id)) return state;
  if (state.orders.some((o) => o.vehicleId === input.vehicleId && o.stage !== "delivered"))
    throw new Error("This vehicle already has an open service order.");
  const order: ServiceOrder = {
    id: input.id, vehicleId: input.vehicleId, plate: input.plate, vehicleLabel: input.vehicleLabel, advisor: text(input.advisor),
    scheduledFor: input.scheduledFor, stage: "scheduled", heldFrom: null, holdReason: "", assignedTo: "",
    history: [{ stage: "scheduled", at, by: text(input.advisor), assignedTo: "", note: "Booked" }],
    checkIn: null, checkOut: null,
    lines: [{ id: `${input.id}-L1`, payType: input.payType, concern: text(input.concern), diagnosis: "", correction: "", claimRef: "", estimatedHours: 0, parts: [] }],
    time: [], comments: [], invoice: { number: "", status: "draft", labourRate: DEFAULT_LABOUR_RATE, issuedAt: "" },
    createdAt: at, updatedAt: at,
  };
  return { ...state, orders: [order, ...state.orders] };
}

/** What still blocks moving this order to the next stage on its path. Empty means it can move. */
export function stageBlockers(order: ServiceOrder, assignedTo: string): string[] {
  const next = nextStage(order);
  if (!next) return ["The order is already delivered."];
  const out: string[] = [];
  if (order.stage === "on_hold") return out;   // resuming only returns to the held stage
  if (next !== "arrived" && !text(assignedTo)) out.push("Assign the stage to a technician or advisor.");
  if (next === "arrived") {
    const c = order.checkIn;
    if (!c) out.push("Record the check-in: odometer, vehicle condition and all four tyres.");
    else {
      if (!(c.odometerKm >= 0)) out.push("Record the odometer reading at arrival.");
      if (TYRES.some((p) => !c.tyres.find((t) => t.position === p && t.state))) out.push("Record the condition of all four tyres.");
      if (!text(c.exterior) || !text(c.interior)) out.push("Describe the exterior and interior condition.");
    }
  }
  if (next === "diagnosis" && !order.lines.some((l) => text(l.concern))) out.push("Add the reported issue.");
  if (next === "service_complete") {
    for (const [i, l] of order.lines.entries()) {
      const n = `Line ${i + 1}`;
      if (!text(l.diagnosis)) out.push(`${n}: record the diagnosis.`);
      if (!text(l.correction)) out.push(`${n}: record the work done.`);
      if (needsClaim(l.payType) && !text(l.claimRef)) out.push(`${n}: add the ${payLabel(l.payType).toLowerCase()} claim or campaign reference.`);
      if (!(l.estimatedHours > 0)) out.push(`${n}: set the estimated labour hours.`);
    }
    if (!order.time.some((t) => t.hours > 0)) out.push("Log the technician hours.");
  }
  if (next === "delivered") {
    const c = order.checkOut;
    if (!c) out.push("Record the odometer and condition at delivery.");
    else if (order.checkIn && c.odometerKm < order.checkIn.odometerKm) out.push("Odometer out cannot be lower than odometer in.");
    if (!text(order.invoice.number) || order.invoice.status === "draft") out.push("Issue the invoice (a zero invoice for warranty, recall or retrofit work).");
  }
  return out;
}

export function nextStage(order: ServiceOrder): Stage | null {
  if (order.stage === "on_hold") return order.heldFrom;
  const i = PATH.indexOf(order.stage);
  return i >= 0 && i < PATH.length - 1 ? PATH[i + 1] : null;
}

/** Move the order to its next stage (or back from On hold), assigned to a technician. */
export function advanceOrder(state: ServiceState, id: string, input: { assignedTo: string; by: string; note?: string }, at: string): ServiceState {
  const order = find(state, id);
  if (!validTime(at) || !text(input.by)) throw new Error("Record who is moving the order and when.");
  const next = nextStage(order);
  const blockers = stageBlockers(order, input.assignedTo);
  if (!next || blockers.length) throw new Error(blockers[0] ?? "The order cannot move.");
  const assignedTo = text(input.assignedTo);
  const event: StageEvent = { stage: next, at, by: text(input.by), assignedTo, note: order.stage === "on_hold" ? `Resumed: ${order.holdReason}` : text(input.note) };
  const technicians = assignedTo && !state.technicians.includes(assignedTo) ? [...state.technicians, assignedTo].sort() : state.technicians;
  return { ...replace(state, { ...order, stage: next, heldFrom: null, holdReason: order.stage === "on_hold" ? "" : order.holdReason, assignedTo,
    history: [...order.history, event], updatedAt: at }), technicians };
}

/** Put an active order on hold, with the reason; it resumes to the stage it left. */
export function holdOrder(state: ServiceState, id: string, input: { reason: string; by: string; assignedTo: string }, at: string): ServiceState {
  const order = find(state, id);
  if (order.stage === "on_hold" || order.stage === "delivered" || order.stage === "scheduled") throw new Error("Only an active order can be put on hold.");
  if (!text(input.reason) || !text(input.by)) throw new Error("Give the reason for the hold and who placed it.");
  return replace(state, { ...order, stage: "on_hold", heldFrom: order.stage, holdReason: text(input.reason), assignedTo: text(input.assignedTo) || order.assignedTo,
    history: [...order.history, { stage: "on_hold", at, by: text(input.by), assignedTo: text(input.assignedTo) || order.assignedTo, note: text(input.reason) }], updatedAt: at });
}

/** Edit the order's records (check-in, lines, parts, time, invoice); stage and history are changed only by advance/hold. */
export function updateOrder(state: ServiceState, id: string, change: (o: ServiceOrder) => ServiceOrder, at: string): ServiceState {
  const order = find(state, id);
  if (order.stage === "delivered") throw new Error("A delivered order is closed; add a comment instead.");
  const next = change(order);
  const errors = recordErrors(next);
  if (errors.length) throw new Error(errors[0]);
  return replace(state, { ...next, id: order.id, stage: order.stage, heldFrom: order.heldFrom, history: order.history, comments: order.comments, updatedAt: at });
}

export function addComment(state: ServiceState, id: string, input: { author: string; role: Role; text: string }, at: string): ServiceState {
  const order = find(state, id);
  if (!text(input.author) || text(input.text).length < 2) throw new Error("Name the author and write the comment.");
  const comment: Comment = { id: `${id}-C${order.comments.length + 1}`, at, author: text(input.author), role: input.role, text: text(input.text) };
  return replace(state, { ...order, comments: [...order.comments, comment], updatedAt: at });
}

/** Problems with the records themselves (numbers, readings), whatever the stage. */
export function recordErrors(o: ServiceOrder): string[] {
  const out: string[] = [];
  for (const c of [o.checkIn, o.checkOut]) {
    if (!c) continue;
    if (!Number.isFinite(c.odometerKm) || c.odometerKm < 0) out.push("Odometer readings must be zero or more.");
    if (c.energyPct !== null && !(c.energyPct >= 0 && c.energyPct <= 100)) out.push("Fuel or charge level is a percentage from 0 to 100.");
    for (const t of c.tyres) {
      if (t.treadMm !== null && !(t.treadMm >= 0 && t.treadMm <= 20)) out.push("Tread depth is between 0 and 20 mm.");
      if (t.pressurePsi !== null && !(t.pressurePsi >= 0 && t.pressurePsi <= 150)) out.push("Tyre pressure is between 0 and 150 psi.");
    }
  }
  if (o.checkIn && o.checkOut && o.checkOut.odometerKm < o.checkIn.odometerKm) out.push("Odometer out cannot be lower than odometer in.");
  for (const l of o.lines) {
    if (!(l.estimatedHours >= 0) || l.estimatedHours > 200) out.push("Estimated hours are between 0 and 200.");
    for (const p of l.parts) if (!(p.qty > 0) || !(p.unitPrice >= 0) || !text(p.description)) out.push("Each part needs a description, a quantity above zero and a price of zero or more.");
  }
  for (const t of o.time) if (!(t.hours > 0 && t.hours <= 24) || !text(t.tech)) out.push("Each time entry needs a technician and between 0 and 24 hours.");
  if (!(o.invoice.labourRate >= 0)) out.push("The labour rate cannot be negative.");
  return out;
}

export interface Totals {
  estimatedHours: number; actualHours: number; efficiency: number | null;   // estimated ÷ actual (100% = on the clock)
  byPay: Record<PayType, { labour: number; parts: number; total: number }>;
  customerTotal: number; claimTotal: number; partsCount: number;
}
export function orderTotals(o: ServiceOrder): Totals {
  const byPay = Object.fromEntries(PAY_TYPES.map((p) => [p.id, { labour: 0, parts: 0, total: 0 }])) as Totals["byPay"];
  const lineHours = new Map<string, number>();
  for (const t of o.time) if (t.lineId) lineHours.set(t.lineId, (lineHours.get(t.lineId) ?? 0) + t.hours);
  const unassigned = o.time.filter((t) => !t.lineId).reduce((s, t) => s + t.hours, 0);
  for (const l of o.lines) {
    // Billed labour is the estimate (flat rate) when set, otherwise the hours logged against the line.
    const hours = l.estimatedHours > 0 ? l.estimatedHours : lineHours.get(l.id) ?? 0;
    const b = byPay[l.payType];
    b.labour += hours * o.invoice.labourRate;
    b.parts += l.parts.reduce((s, p) => s + p.qty * p.unitPrice, 0);
  }
  for (const b of Object.values(byPay)) b.total = b.labour + b.parts;
  const estimatedHours = o.lines.reduce((s, l) => s + l.estimatedHours, 0);
  const actualHours = [...lineHours.values()].reduce((s, h) => s + h, 0) + unassigned;
  return { estimatedHours, actualHours, efficiency: actualHours > 0 && estimatedHours > 0 ? estimatedHours / actualHours : null, byPay,
    customerTotal: byPay.customer.total, claimTotal: byPay.warranty.total + byPay.recall.total + byPay.retrofit.total,
    partsCount: o.lines.reduce((s, l) => s + l.parts.reduce((n, p) => n + p.qty, 0), 0) };
}

/** Hours since the order entered its current stage. */
export const hoursInStage = (o: ServiceOrder, now: string) => Math.max(0, (Date.parse(now) - Date.parse(o.history.at(-1)!.at)) / 36e5);

export interface ServiceReport {
  byStage: Record<Stage, number>; open: number; onHold: number; holdReasons: { reason: string; orders: number }[];
  deliveredLast7: number; avgDwellHours: number | null;    // arrived → delivered, delivered orders
  technicians: { tech: string; hours: number; estimated: number; efficiency: number | null; open: number }[];
  pay: { payType: PayType; lines: number; total: number }[];
  claimsMissingRef: number;   // lines at Diagnosis still without the claim or campaign number they need to complete
  customerRevenue: number;
}
export function serviceReport(state: ServiceState, now: string): ServiceReport {
  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>;
  const reasons = new Map<string, number>(), techs = new Map<string, { hours: number; estimated: number; open: number }>();
  const pay = new Map<PayType, { lines: number; total: number }>(PAY_TYPES.map((p) => [p.id, { lines: 0, total: 0 }]));
  let delivered7 = 0, dwell = 0, dwellN = 0, missing = 0, revenue = 0;
  for (const o of state.orders) {
    byStage[o.stage] += 1;
    if (o.stage === "on_hold") reasons.set(o.holdReason, (reasons.get(o.holdReason) ?? 0) + 1);
    const t = orderTotals(o);
    for (const e of o.time) { const x = techs.get(e.tech) ?? { hours: 0, estimated: 0, open: 0 }; x.hours += e.hours; techs.set(e.tech, x); }
    for (const l of o.lines) {
      const share = o.time.filter((e) => e.lineId === l.id);
      for (const e of share) techs.get(e.tech)!.estimated += l.estimatedHours * (e.hours / share.reduce((s, x) => s + x.hours, 0));
      const p = pay.get(l.payType)!; p.lines += 1;
      // A claim or campaign number is due at diagnosis (it gates completion); earlier stages are not late yet.
      if (o.stage === "diagnosis" && needsClaim(l.payType) && !text(l.claimRef)) missing += 1;
    }
    for (const p of PAY_TYPES) pay.get(p.id)!.total += t.byPay[p.id].total;
    if (o.stage !== "delivered" && o.assignedTo) { const x = techs.get(o.assignedTo) ?? { hours: 0, estimated: 0, open: 0 }; x.open += 1; techs.set(o.assignedTo, x); }
    if (o.stage === "delivered") {
      const end = Date.parse(o.history.at(-1)!.at), start = o.history.find((h) => h.stage === "arrived");
      if (Date.parse(now) - end <= 7 * 864e5) delivered7 += 1;
      if (start) { dwell += (end - Date.parse(start.at)) / 36e5; dwellN += 1; }
      revenue += t.customerTotal;
    }
  }
  return {
    byStage, open: state.orders.filter((o) => o.stage !== "delivered").length, onHold: byStage.on_hold,
    holdReasons: [...reasons].map(([reason, orders]) => ({ reason, orders })).sort((a, b) => b.orders - a.orders),
    deliveredLast7: delivered7, avgDwellHours: dwellN ? dwell / dwellN : null,
    technicians: [...techs].map(([tech, x]) => ({ tech, ...x, efficiency: x.hours > 0 && x.estimated > 0 ? x.estimated / x.hours : null })).sort((a, b) => b.hours - a.hours),
    pay: [...pay].map(([payType, x]) => ({ payType, ...x })), claimsMissingRef: missing, customerRevenue: revenue,
  };
}

/** Every visit of one vehicle, newest first, with its odometer and tyre readings. */
export function vehicleHistory(state: ServiceState, vehicleId: string) {
  return state.orders.filter((o) => o.vehicleId === vehicleId)
    .sort((a, b) => Date.parse(b.scheduledFor) - Date.parse(a.scheduledFor))
    .map((o) => ({ order: o, totals: orderTotals(o), odometerIn: o.checkIn?.odometerKm ?? null, odometerOut: o.checkOut?.odometerKm ?? null,
      tyres: o.checkIn?.tyres ?? [], delivered: o.history.find((h) => h.stage === "delivered")?.at ?? null }));
}

/** Shape check for stored state (owner data is decrypted from the workspace; anything unrecognised is dropped). */
export function isServiceState(v: unknown): v is ServiceState {
  const s = v as ServiceState;
  return !!s && typeof s === "object" && s.version === 1 && Array.isArray(s.orders) && Array.isArray(s.technicians)
    && s.orders.every((o) => o && typeof o.id === "string" && STAGES.some((x) => x.id === o.stage) && Array.isArray(o.history) && o.history.length > 0
      && Array.isArray(o.lines) && Array.isArray(o.time) && Array.isArray(o.comments) && !!o.invoice);
}
