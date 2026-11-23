/**
 * Demo service orders for the practice fleet. Built by driving the real service functions (book, check in, advance
 * through every gate, hold, log time, invoice), so every demo order is one the rules accept.
 */
import { lcg } from "./live";
import {
  DEFAULT_LABOUR_RATE, HOLD_REASONS, TYRES, advanceOrder, addComment, emptyService, holdOrder, scheduleOrder, updateOrder,
  type ConditionCheck, type PayType, type ServiceState, type Stage, type TyreState,
} from "./service";

export interface DemoVehicle { vehicle_id: string; plate_number: string | null; make: string | null; model: string | null }

const TECHS = ["Ahmed Karim", "Bilal Saeed", "Carlos Mendes", "Dina Haddad", "Farhan Ali", "Grace Okafor"];
const ADVISORS = ["Lina Haddad", "Omar Farouk", "Sara Nasser"];
const JOBS: { payType: PayType; concern: string; diagnosis: string; correction: string; hours: number; parts: [string, string, number][] }[] = [
  { payType: "customer", concern: "Scheduled service at 40,000 km", diagnosis: "Due service; cabin filter clogged, brake fluid moisture 3%", correction: "Replaced cabin filter, flushed brake fluid, multipoint inspection", hours: 1.6, parts: [["CF-2210", "Cabin air filter", 32], ["BF-DOT4", "Brake fluid DOT 4 (1 L)", 18]] },
  { payType: "customer", concern: "Front brakes grinding", diagnosis: "Front pads at 2 mm, discs scored beyond minimum", correction: "Replaced front pads and discs, cleaned and greased calipers", hours: 2.1, parts: [["BP-F118", "Front brake pad set", 96], ["BD-F330", "Front brake disc", 145]] },
  { payType: "warranty", concern: "Charge port door will not open", diagnosis: "Charge port actuator failed (no response to command)", correction: "Replaced charge port actuator, verified with 5 open/close cycles", hours: 0.9, parts: [["CP-ACT7", "Charge port actuator", 0]] },
  { payType: "warranty", concern: "Window rattles on the driver's door", diagnosis: "Window regulator clip broken", correction: "Replaced driver window regulator", hours: 1.4, parts: [["WR-DL02", "Window regulator, driver", 0]] },
  { payType: "recall", concern: "Recall campaign: rear seat belt anchor inspection", diagnosis: "Anchor bolt torque below specification", correction: "Re-torqued rear anchor bolts to specification and marked", hours: 0.5, parts: [] },
  { payType: "recall", concern: "Recall campaign: front suspension fore link", diagnosis: "Vehicle in affected VIN range", correction: "Replaced both front fore links per campaign procedure", hours: 1.8, parts: [["FL-SUS4", "Front fore link", 0]] },
  { payType: "retrofit", concern: "Retrofit: fleet telematics unit", diagnosis: "Vehicle on the retrofit list; harness accessible", correction: "Installed telematics unit and harness, verified data link", hours: 1.2, parts: [["TL-UNIT", "Telematics unit", 0], ["TL-HRN", "Harness", 0]] },
  { payType: "customer", concern: "Tyres worn, vibration at 100 km/h", diagnosis: "Rear tyres at 2 mm, wheel balance out", correction: "Replaced two rear tyres, balanced and aligned", hours: 1.3, parts: [["TY-23545", "Tyre 235/45 R18", 180]] },
  { payType: "customer", concern: "Air conditioning not cooling", diagnosis: "Refrigerant low; leak at condenser service valve", correction: "Replaced valve core, evacuated and recharged", hours: 1.7, parts: [["AC-VC1", "Service valve core", 12], ["AC-R1234", "Refrigerant R1234yf (kg)", 85]] },
];
const STOPS: Stage[] = ["scheduled", "arrived", "service_ready", "on_hold", "in_service", "diagnosis", "service_complete", "delivered"];
// How many orders end at each stage: a realistic board, busy in the middle, with history in Delivered.
const MIX = [4, 3, 3, 4, 5, 3, 3, 15];


export function demoService(vehicles: DemoVehicle[], nowIso: string, seed = 42): ServiceState {
  const r = lcg(seed), now = Date.parse(nowIso);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  let state = emptyService(), n = 0;
  for (const [stopIndex, count] of MIX.entries()) for (let k = 0; k < count && n < vehicles.length; k++, n++) {
    const v = vehicles[n], stop = STOPS[stopIndex], job = pick(JOBS), id = `SO-${String(4100 + n).padStart(5, "0")}`;
    const advisor = pick(ADVISORS), tech = pick(TECHS);
    // Delivered history goes back up to six weeks; open work started within the last few days.
    let t = now - (stop === "delivered" ? 24 + r() * 1000 : 6 + r() * 70) * 36e5;
    const at = () => { t += (0.4 + r() * 3) * 36e5; return new Date(Math.min(t, now - 60_000)).toISOString(); };
    const label = [v.make, v.model].filter(Boolean).join(" ") || v.vehicle_id;
    state = scheduleOrder(state, { id, vehicleId: v.vehicle_id, plate: v.plate_number ?? v.vehicle_id, vehicleLabel: label, advisor,
      scheduledFor: new Date(t + 2 * 36e5).toISOString(), concern: job.concern, payType: job.payType }, new Date(t).toISOString());
    if (stop === "scheduled") continue;
    const odo = Math.round(8_000 + r() * 90_000);
    const tyre = (): TyreState => (r() < 0.75 ? "good" : r() < 0.85 ? "worn" : r() < 0.95 ? "replace" : "damaged");
    const check = (km: number, when: string): ConditionCheck => {
      const damage = r() < 0.2;
      return { at: when, by: advisor, odometerKm: km, energyPct: Math.round(15 + r() * 80),
      exterior: damage ? "Scratch on the rear bumper, photographed with the customer" : "No new damage; light stone chips on the bonnet",
      interior: r() < 0.85 ? "Clean, no damage" : "Driver seat bolster worn", warningLights: r() < 0.8 ? "None" : "Tyre pressure warning",
      damage, tyres: TYRES.map((position) => ({ position, treadMm: Math.round((2 + r() * 6) * 10) / 10, pressurePsi: Math.round(34 + r() * 8), state: tyre() })) };
    };
    const arrive = at();
    state = updateOrder(state, id, (o) => ({ ...o, checkIn: check(odo, arrive) }), arrive);
    state = advanceOrder(state, id, { assignedTo: advisor, by: advisor, note: "Customer waiting area" }, arrive);
    if (stop === "arrived") continue;
    state = advanceOrder(state, id, { assignedTo: tech, by: advisor }, at());
    if (stop === "service_ready") continue;
    if (stop === "on_hold") { state = holdOrder(state, id, { reason: pick(HOLD_REASONS.slice(0, 5)), by: advisor, assignedTo: tech }, at()); continue; }
    if (r() < 0.3) { state = holdOrder(state, id, { reason: "Waiting for parts", by: advisor, assignedTo: tech }, at()); state = advanceOrder(state, id, { assignedTo: tech, by: advisor }, at()); }
    state = advanceOrder(state, id, { assignedTo: tech, by: tech }, at());
    if (stop === "in_service") { state = addComment(state, id, { author: tech, role: "technician", text: "Started; road test planned after the work." }, at()); continue; }
    state = advanceOrder(state, id, { assignedTo: tech, by: tech }, at());
    const claim = job.payType === "customer" ? "" : `${job.payType === "warranty" ? "WC" : job.payType === "recall" ? "RC" : "RF"}-${Math.floor(100000 + r() * 899999)}`;
    const logged = Math.round(job.hours * (0.75 + r() * 0.6) * 10) / 10;
    state = updateOrder(state, id, (o) => ({ ...o, lines: o.lines.map((l) => ({ ...l, diagnosis: job.diagnosis, correction: job.correction, claimRef: claim, estimatedHours: job.hours,
      parts: job.parts.map(([partNumber, description, unitPrice], i) => ({ id: `${l.id}-P${i + 1}`, partNumber, description, qty: description.startsWith("Tyre") ? 2 : 1, unitPrice })) })),
      time: [{ id: `${id}-T1`, tech, lineId: o.lines[0].id, hours: logged, at: new Date(t).toISOString(), note: "" }] }), at());
    if (stop === "diagnosis") continue;
    state = advanceOrder(state, id, { assignedTo: tech, by: tech, note: "Road tested" }, at());
    state = addComment(state, id, { author: tech, role: "technician", text: r() < 0.5 ? "Work complete, road tested 8 km, no faults." : "Done. Recommend rear pads at the next visit (4 mm)." }, at());
    if (stop === "service_complete") continue;
    const out = at();
    state = updateOrder(state, id, (o) => ({ ...o, checkOut: { ...check(odo + Math.round(3 + r() * 12), out), tyres: o.checkIn!.tyres },
      invoice: { number: `INV-${70000 + n}`, status: r() < 0.7 ? "paid" : "issued", labourRate: DEFAULT_LABOUR_RATE, issuedAt: out } }), out);
    state = advanceOrder(state, id, { assignedTo: advisor, by: advisor, note: "Keys handed to the driver" }, out);
    if (r() < 0.35) state = addComment(state, id, { author: "Fleet owner", role: "owner", text: "Please book the next service at 50,000 km." }, out);
  }
  return state;
}
