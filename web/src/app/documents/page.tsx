"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, FilePdf, IdentificationCard, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { BASE, useEngine, useSql } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { extractFields, isSafeDocumentPreview, readDocument, type DocType, type KnownVehicle } from "@/lib/docscan";
import { vinModelYear } from "@/lib/vin";
import { deleteFile, emptyWorkspace, loadFile, saveFile, uid, type SavedDocument } from "@/lib/workspace";

const TYPES: DocType[] = ["Registration", "Insurance", "Inspection", "Permit", "Other"];
const STATUS_COLOR: Record<string, string> = { Valid: "var(--good)", Expiring: "var(--warn)", Expired: "var(--bad)", Unknown: "var(--faint)" };

function status(expiry: string | null): string {
  if (!expiry) return "Unknown";
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = (new Date(expiry).getTime() - today) / 864e5;
  return days < 0 ? "Expired" : days <= 30 ? "Expiring" : "Valid";
}

interface Scan { name: string; stage: string; pct: number }

export default function DocumentsPage() {
  const { workspace, commit, dataset, status: engineStatus } = useEngine();
  const known = useSql<KnownVehicle>("SELECT vehicle_id, plate_number, vin FROM mart_fleet_registry");
  const insurers = useSql<{ insurer: string }>("SELECT DISTINCT insurer FROM mart_fleet_registry WHERE insurer IS NOT NULL");
  const coverage = useSql<{ doc_type: string; vehicles: number; on_file: number; valid: number; expiring: number; expired: number }>(
    "SELECT doc_type, sum(vehicles)::INT AS vehicles, sum(on_file)::INT AS on_file, sum(\"valid\")::INT AS \"valid\", sum(expiring)::INT AS expiring, sum(expired)::INT AS expired FROM mart_document_coverage GROUP BY 1 ORDER BY 1");
  const [scans, setScans] = useState<Scan[]>([]);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState("");
  const docs = useMemo(() => workspace?.documents ?? [], [workspace]);
  const pending = docs.filter((d) => !d.confirmed);
  const confirmed = docs.filter((d) => d.confirmed);
  const busy = engineStatus === "running" || scans.length > 0;
  const mine = dataset === "mine";

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    let ws = workspace ?? emptyWorkspace();
    const vehicles = known.data ?? [];
    for (const file of [...list]) {
      setScans((s) => [...s, { name: file.name, stage: "queued", pct: 0 }]);
      try {
        const text = await readDocument(BASE, file, (stage, pct) =>
          setScans((s) => s.map((x) => (x.name === file.name ? { ...x, stage, pct } : x))));
        const x = extractFields(text, mine ? vehicles : [], (insurers.data ?? []).map((i) => i.insurer));
        const id = uid("doc");
        await saveFile(id, file);
        const doc: SavedDocument = {
          id, vehicle_ref: x.vehicle_ref ?? x.plate_in_text ?? x.vin_in_text ?? "", doc_type: x.doc_type, document_number: x.document_number,
          issue_date: x.issue_date, expiry_date: x.expiry_date, issuer: x.issuer, file_name: file.name, mime: file.type,
          confirmed: false, ocr_text: text, added: new Date().toISOString(),
          create_vehicle: !x.vehicle_id, vin: x.vin_in_text, plate: x.plate_in_text,
        };
        ws = { ...ws, documents: [...ws.documents, doc] };
        await commit(ws, { rebuild: false });   // saved; it counts only once confirmed
      } catch (e) {
        setScans((s) => s.map((x) => (x.name === file.name ? { ...x, stage: `failed: ${(e as Error).message}`, pct: 1 } : x)));
        await new Promise((r) => setTimeout(r, 2500));
      }
      setScans((s) => s.filter((x) => x.name !== file.name));
    }
  }

  async function patch(id: string, p: Partial<SavedDocument>, rebuild = false) {
    if (!workspace) return;
    await commit({ ...workspace, documents: workspace.documents.map((d) => (d.id === id ? { ...d, ...p } : d)) }, { rebuild });
  }

  async function remove(id: string) {
    if (!workspace) return;
    await deleteFile(id);
    const wasConfirmed = workspace.documents.find((d) => d.id === id)?.confirmed;
    await commit({ ...workspace, documents: workspace.documents.filter((d) => d.id !== id) }, { rebuild: !!wasConfirmed });
  }

  const shown = confirmed.filter((d) => !filter || `${d.vehicle_ref} ${d.doc_type} ${d.issuer} ${d.file_name}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="Your fleet" title="Registration cards and policies">
        Photograph or scan registration cards (mulkiya, istimara, ruhsat, V5C), insurance policies, inspection certificates and permits.
        Each is read in this browser (English and Arabic), matched to the vehicle by its plate, VIN or fleet number, and its expiry flows
        into compliance once you confirm it.
      </PageHeader>

      {!mine && (
        <Card className="mb-4 border-accent/40">
          <p className="text-[13.5px] text-muted">
            You are looking at the demo fleet. <Link href="/import/" className="font-medium text-accent hover:underline">Import your vehicle list</Link>{" "}
            first so cards match your vehicles, or start from the cards: any card that matches no vehicle can create it.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
          className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-accent bg-accent-soft" : "hover:border-accent"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <IdentificationCard size={34} className="text-accent" />
          <span className="text-[16px] font-semibold">Drop photos or PDFs of documents</span>
          <span className="text-[13px] text-muted">JPG, PNG, WEBP or PDF · several at once. The first scan downloads the reader (about 9 MB), once.</span>
          <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,application/pdf,text/plain" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        <Card title="Coverage" sub="Active vehicles with a document on file, and its status">
          {coverage.data ? (
            <div className="space-y-3">
              {coverage.data.map((c) => (
                <div key={c.doc_type}>
                  <div className="flex justify-between text-[13px]"><span>{c.doc_type}</span>
                    <span className="tnum text-muted">{c.on_file.toLocaleString()} / {c.vehicles.toLocaleString()} on file</span></div>
                  <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-panel-2">
                    {(["valid", "expiring", "expired"] as const).map((k) => (
                      <div key={k} style={{ width: `${(100 * c[k]) / Math.max(c.vehicles, 1)}%`, background: STATUS_COLOR[k[0].toUpperCase() + k.slice(1)] }} />
                    ))}
                  </div>
                  <p className="mt-1 text-[11.5px] text-faint">{c.valid} valid · {c.expiring} expiring ≤ 30 days · {c.expired} expired</p>
                </div>
              ))}
            </div>
          ) : coverage.error ? <p className="text-[12.5px] text-bad">{coverage.error}</p> : <Skeleton height={120} />}
        </Card>
      </div>

      {scans.length > 0 && (
        <Card className="mt-4">
          {scans.map((s) => (
            <div key={s.name} className="mb-2 text-[13px]">
              <div className="flex justify-between"><span>{s.name}</span><span className="text-muted">{s.stage}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-panel-2"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${Math.round(s.pct * 100)}%` }} /></div>
            </div>
          ))}
        </Card>
      )}

      {pending.length > 0 && (
        <>
          <SectionTitle sub="Check what was read. Nothing counts until you confirm it.">To review · {pending.length}</SectionTitle>
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((d) => <Review key={d.id} d={d} known={known.data ?? []} onPatch={patch} onRemove={remove} />)}
          </div>
        </>
      )}

      <SectionTitle sub="Confirmed documents, saved in this browser with their scans.">Document vault · {confirmed.length}</SectionTitle>
      <Card>
        {confirmed.length ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <MagnifyingGlass size={15} className="text-faint" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search plate, VIN, type, issuer…" className="w-full bg-transparent text-[13px] outline-none" />
            </div>
            <table className="tnum w-full text-[13px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Type</th><th className="font-medium">Issuer</th><th className="font-medium">Expires</th><th className="font-medium">Status</th><th /></tr></thead>
              <tbody>{shown.map((d) => {
                const st = status(d.expiry_date);
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-2">{d.vehicle_ref}{d.create_vehicle && <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-[11px] text-accent">new vehicle</span>}</td>
                    <td>{d.doc_type}</td><td className="text-muted">{d.issuer ?? "–"}</td><td>{d.expiry_date ?? "–"}</td>
                    <td><span className="font-medium" style={{ color: STATUS_COLOR[st] }}>{st}</span></td>
                    <td className="text-right">
                      <OpenFile id={d.id} name={d.file_name} />
                      <button onClick={() => remove(d.id)} aria-label="Delete document" className="ml-1 rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-bad"><Trash size={15} /></button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </>
        ) : <p className="text-[13px] text-muted">No documents yet.</p>}
      </Card>
    </>
  );
}

function OpenFile({ id, name }: { id: string; name: string }) {
  return (
    <button aria-label={`Open ${name}`} className="rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-accent" onClick={async () => {
      const blob = await loadFile(id);
      if (!blob) return;
      const safe = isSafeDocumentPreview(blob.type);
      const url = URL.createObjectURL(safe ? blob : new Blob([blob], { type: "application/octet-stream" }));
      if (safe) window.open(url, "_blank", "noopener,noreferrer");
      else {
        // Older workspaces may contain HTML or SVG. Download without giving it this origin.
        const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }}><FilePdf size={15} /></button>
  );
}

function Thumb({ id, mime }: { id: string; mime: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    loadFile(id).then((b) => { if (live && b && mime.startsWith("image/") && isSafeDocumentPreview(b.type)) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id, mime]);
  // a local blob URL of the owner's own scan: next/image cannot optimise it, and nothing is fetched
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-36 w-full rounded-lg object-cover" />
    : <div className="flex h-36 items-center justify-center rounded-lg bg-panel-2 text-faint"><FilePdf size={30} /></div>;
}

function Review({ d, known, onPatch, onRemove }: {
  d: SavedDocument; known: KnownVehicle[]; onPatch: (id: string, p: Partial<SavedDocument>, rebuild?: boolean) => void; onRemove: (id: string) => void;
}) {
  const [f, setF] = useState(d);
  const [text, setText] = useState(false);
  const match = known.find((k) => [k.vehicle_id, k.plate_number, k.vin].some((x) => x && x.replace(/\W/g, "").toUpperCase() === f.vehicle_ref.replace(/\W/g, "").toUpperCase()));
  const input = "w-full rounded-md border border-border bg-panel px-2 py-1 text-[13px]";
  const year = f.vin ? vinModelYear(f.vin) : null;
  return (
    <Card className="p-4">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div>
          <Thumb id={d.id} mime={d.mime} />
          <p className="mt-1.5 truncate text-[11.5px] text-faint">{d.file_name}</p>
          <button onClick={() => setText(!text)} className="text-[11.5px] text-accent hover:underline">{text ? "Hide" : "Show"} text read</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <label className="col-span-2">Vehicle (plate, VIN or fleet number)
            <input list="vehicle-refs" className={input} value={f.vehicle_ref} onChange={(e) => setF({ ...f, vehicle_ref: e.target.value })} />
            <span className="mt-0.5 block text-[11px]" style={{ color: match ? "var(--good)" : "var(--warn)" }}>
              {match ? `Matches ${match.vehicle_id}${match.plate_number ? ` · ${match.plate_number}` : ""}` : "No vehicle with this reference"}
            </span>
          </label>
          {!match && (
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={!!f.create_vehicle} onChange={(e) => setF({ ...f, create_vehicle: e.target.checked, plate: f.plate ?? f.vehicle_ref })} />
              Add it to my fleet as a new vehicle{f.vin ? ` (VIN ${f.vin}${year ? `, model year ${year}` : ""})` : ""}
            </label>
          )}
          <label>Type
            <select className={input} value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value as DocType })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Number<input className={input} value={f.document_number ?? ""} onChange={(e) => setF({ ...f, document_number: e.target.value || null })} /></label>
          <label>Issued<input type="date" className={input} value={f.issue_date ?? ""} onChange={(e) => setF({ ...f, issue_date: e.target.value || null })} /></label>
          <label>Expires<input type="date" className={input} value={f.expiry_date ?? ""} onChange={(e) => setF({ ...f, expiry_date: e.target.value || null })} /></label>
          <label className="col-span-2">Issuer<input className={input} value={f.issuer ?? ""} onChange={(e) => setF({ ...f, issuer: e.target.value || null })} /></label>
          <div className="col-span-2 mt-1 flex gap-2">
            <button disabled={!f.vehicle_ref || (!match && !f.create_vehicle)}
              onClick={() => onPatch(d.id, { ...f, confirmed: true, create_vehicle: !match && !!f.create_vehicle,
                plate: !match ? (f.plate ?? (f.vehicle_ref !== f.vin ? f.vehicle_ref : null)) : null }, true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white transition active:scale-95 disabled:opacity-40">
              <CheckCircle size={15} /> Confirm
            </button>
            <button onClick={() => onRemove(d.id)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted hover:text-bad">Discard</button>
          </div>
        </div>
      </div>
      {text && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-[11px] text-muted">{d.ocr_text || "(no text found)"}</pre>}
      <datalist id="vehicle-refs">
        {known.slice(0, 5000).flatMap((k) => [k.plate_number, k.vin, k.vehicle_id]).filter(Boolean).map((v, i) => <option key={i} value={v!} />)}
      </datalist>
    </Card>
  );
}

