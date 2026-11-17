"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { X, Warning } from "@phosphor-icons/react";
import { vehicleLabel, type GarageRow, type GarageState, reportAccident } from "@/lib/garage";

type Change = (update: (state: GarageState) => GarageState) => Promise<boolean>;
function localTime() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
export function IncidentDialog({ rows, preset, onClose, change, saving, error }: {
  rows: GarageRow[]; preset?: string; onClose: () => void; change: Change; saving: boolean; error: string | null;
}) {
  const [search, setSearch] = useState(""), [vehicle, setVehicle] = useState(preset ?? "");
  const [owner, setOwner] = useState(""), [summary, setSummary] = useState(""), [time, setTime] = useState(localTime);
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
    const now = new Date().toISOString();
    const ok = await change((state) => reportAccident(state, {
      id: crypto.randomUUID(), vehicleId: vehicle, owner, summary, occurredAt: occurred.toISOString(),
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
        {(formError || error) && <p role="alert" className="text-sm text-bad">{formError || error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Dialog.Close disabled={saving} className="ops-button">Cancel</Dialog.Close>
          <button disabled={saving} className="garage-primary" type="submit">{saving ? "Recording…" : "Record incident and hold vehicle"}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
