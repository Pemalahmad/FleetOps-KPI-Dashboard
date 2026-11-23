"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { X, Warning } from "@phosphor-icons/react";
import { createDamageCase, vehicleLabel, type DamageDrivability, type DamageSeverity, type GarageRow, type GarageState, reportAccident } from "@/lib/garage";

type Change = (update: (state: GarageState) => GarageState) => Promise<boolean>;
function localTime() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
export function IncidentDialog({ rows, preset, onClose, change, saving, error }: {
  rows: GarageRow[]; preset?: string; onClose: () => void; change: Change; saving: boolean; error: string | null;
}) {
  const [search, setSearch] = useState(""), [vehicle, setVehicle] = useState(preset ?? "");
  const [owner, setOwner] = useState(""), [summary, setSummary] = useState(""), [time, setTime] = useState(localTime);
  const [severity, setSeverity] = useState<DamageSeverity>("unclassified"), [drivability, setDrivability] = useState<DamageDrivability>("unknown");
  const [facts, setFacts] = useState({ injuryOrEmergency: false, thirdParty: false, publicProperty: false, towRequired: false });
  const [holdReason, setHoldReason] = useState("Pending damage assessment and controlled release");
  const [policeRequired, setPoliceRequired] = useState(""), [insurerRequired, setInsurerRequired] = useState("");
  const [policeDue, setPoliceDue] = useState(""), [insurerDue, setInsurerDue] = useState(""), [managementDue, setManagementDue] = useState("");
  const options = useMemo(() => {
    const q = search.toLowerCase();
    const matches = rows.filter((r) => [r.vehicle_id, r.plate_number, r.make, r.model].some((v) => v?.toLowerCase().includes(q))).slice(0, 30);
    const selected = rows.find((r) => r.vehicle_id === vehicle);
    return selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  }, [rows, search, vehicle]);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = async () => {
    setFormError(null);
    if (!rows.some((r) => r.vehicle_id === vehicle)) { setFormError("Choose a vehicle from this fleet."); return; }
    const occurred = new Date(time);
    if (!Number.isFinite(occurred.getTime())) { setFormError("Enter a valid incident time."); return; }
    if (severity === "unclassified" || drivability === "unknown") { setFormError("Classify severity and drivability before recording the hold."); return; }
    if (!policeRequired || !insurerRequired || !managementDue) { setFormError("Record police and insurer decisions plus the management escalation deadline."); return; }
    const now = new Date().toISOString();
    const damage = createDamageCase(now, owner);
    damage.severity = severity; damage.drivability = drivability; damage.facts = facts; damage.hold.reason = holdReason;
    const setDecision = (kind: "police" | "insurer", required: string, due: string) => {
      damage.notifications[kind] = { ...damage.notifications[kind], required: required === "yes", status: required === "yes" ? "pending" : "not_required", dueAt: required === "yes" && due ? new Date(due).toISOString() : "", waiverReason: required === "no" ? "Recorded as not required after initial fact review" : "" };
    };
    setDecision("police", policeRequired, policeDue); setDecision("insurer", insurerRequired, insurerDue);
    damage.notifications.management.dueAt = new Date(managementDue).toISOString();
    const ok = await change((state) => reportAccident(state, {
      id: crypto.randomUUID(), vehicleId: vehicle, owner, summary, occurredAt: occurred.toISOString(), damage,
    }, now));
    if (ok) onClose();
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="garage-overlay" /><Dialog.Content className="garage-dialog garage-incident-dialog">
      <div className="flex items-start justify-between gap-4"><div>
        <div className="mb-2 flex items-center gap-2 text-bad"><Warning size={20} weight="fill" /><span className="text-sm font-semibold">Accident intake</span></div>
        <Dialog.Title className="text-2xl font-semibold">Report an accident</Dialog.Title>
      </div><Dialog.Close disabled={saving} aria-label="Close accident report" className="garage-icon-button"><X size={20} /></Dialog.Close></div>
      <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">Record the incident, hold the vehicle and start recovery. The recovery owner can then track assessment, repairs and dispatch review.</Dialog.Description>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-5 space-y-4">
        <label className="garage-field">Find vehicle<input className="ops-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Plate, fleet number, make or model" /></label>
        <label className="garage-field">Vehicle<select className="ops-input" required value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
          <option value="">Choose a vehicle</option>{options.map((r) => <option key={r.vehicle_id} value={r.vehicle_id}>{vehicleLabel(r)} · {r.make ?? ""} {r.model ?? ""} · {r.vehicle_id}</option>)}
        </select><span className="text-xs font-normal text-muted">Search narrows the vehicle list.</span></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="garage-field">Recovery owner<input className="ops-input" required maxLength={120} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name the person responsible" /></label>
          <label className="garage-field">Incident time<input className="ops-input" type="datetime-local" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <label className="garage-field">What happened?<textarea className="ops-input min-h-28" required minLength={5} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Describe the vehicle damage, job reference and immediate action. Avoid personal or medical details." /></label>
        <fieldset className="garage-damage-section"><legend>Initial safety classification</legend>
          <div className="grid gap-4 sm:grid-cols-2"><label className="garage-field">Severity<select className="ops-input" value={severity} onChange={(e) => setSeverity(e.target.value as DamageSeverity)}><option value="unclassified">Select severity</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="major">Major</option><option value="critical">Critical</option></select></label>
          <label className="garage-field">Drivability<select className="ops-input" value={drivability} onChange={(e) => setDrivability(e.target.value as DamageDrivability)}><option value="unknown">Select status</option><option value="drivable">Drivable under recorded controls</option><option value="not_drivable">Not drivable</option></select></label></div>
          <div className="garage-fact-grid">{([ ["injuryOrEmergency", "Injury or emergency response"], ["thirdParty", "Third party involved"], ["publicProperty", "Public property involved"], ["towRequired", "Tow or recovery required"] ] as const).map(([id, label]) => <label key={id}><input type="checkbox" checked={facts[id]} onChange={(e) => setFacts({ ...facts, [id]: e.target.checked })} /> {label}</label>)}</div>
          <label className="garage-field">Operational hold reason<input className="ops-input" required value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /></label>
        </fieldset>
        <fieldset className="garage-damage-section"><legend>Recorded escalation decisions</legend>
          <p className="mb-3 text-xs text-muted">This app records decisions and evidence only. It does not contact police, insurers or management. Use the deadline supplied by the responsible authority or policy; the app does not impose a universal GCC deadline.</p>
          <div className="grid gap-4 sm:grid-cols-2"><label className="garage-field">Police notification<select className="ops-input" value={policeRequired} onChange={(e) => setPoliceRequired(e.target.value)}><option value="">Select decision</option><option value="yes">Required</option><option value="no">Not required, record rationale</option></select></label>{policeRequired === "yes" && <label className="garage-field">Police deadline<input className="ops-input" type="datetime-local" value={policeDue} onChange={(e) => setPoliceDue(e.target.value)} required /></label>}
          <label className="garage-field">Insurer notification<select className="ops-input" value={insurerRequired} onChange={(e) => setInsurerRequired(e.target.value)}><option value="">Select decision</option><option value="yes">Required</option><option value="no">Not required, record rationale</option></select></label>{insurerRequired === "yes" && <label className="garage-field">Insurer deadline<input className="ops-input" type="datetime-local" value={insurerDue} onChange={(e) => setInsurerDue(e.target.value)} required /></label>}
          <label className="garage-field">Management escalation deadline<input className="ops-input" type="datetime-local" value={managementDue} onChange={(e) => setManagementDue(e.target.value)} required /></label></div>
        </fieldset>
        {(formError || error) && <p role="alert" className="text-sm text-bad">{formError || error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Dialog.Close disabled={saving} className="ops-button">Cancel</Dialog.Close>
          <button disabled={saving} className="garage-primary" type="submit">{saving ? "Recording…" : "Record incident and hold vehicle"}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
