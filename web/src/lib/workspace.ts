/**
 * The owner's fleet, kept in this browser (IndexedDB). Nothing is sent anywhere: the imported sheets, the
 * column mappings, the scanned documents (with their image or PDF) and any VIN decodes stay on this device,
 * and the pipeline rebuilds from them on every visit.
 */
import type { VinSpec } from "./vin";

export interface SavedInput {
  id: string;
  table: string;
  label: string;                               // "fleet.xlsx · Vehicles"
  csv?: string;                                // tabular sheets, normalised to CSV
  bytes?: Uint8Array;                          // parquet / json, passed through
  kind: "tabular" | "parquet" | "json";
  mapping: Record<string, string | null>;      // contract column -> source header, or "=constant"
  rows: number;
  added: string;
}

export interface SavedDocument {
  id: string;
  vehicle_ref: string;                         // vehicle id, plate or VIN
  doc_type: "Registration" | "Insurance" | "Inspection" | "Permit" | "Other";
  document_number: string | null;
  issue_date: string | null;                   // ISO yyyy-mm-dd
  expiry_date: string | null;
  issuer: string | null;
  file_name: string;
  mime: string;
  confirmed: boolean;
  ocr_text: string;
  added: string;
  /** No vehicle matched: create one from this card (plate and VIN as read). */
  create_vehicle?: boolean;
  plate?: string | null;
  vin?: string | null;
}

export interface Workspace {
  name: string;
  inputs: SavedInput[];
  documents: SavedDocument[];
  vinSpecs: Record<string, VinSpec>;
  updated: string;
}

const DB = "fleetops-workspace";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    let req: IDBRequest<T>;
    try { req = fn(transaction.objectStore(store)); }
    catch (error) { db.close(); reject(error); return; }
    // A successful request can still be rolled back (for example by a quota failure).
    transaction.oncomplete = () => { db.close(); resolve(req.result); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Storage transaction aborted")); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? req.error); };
  });
}

export const emptyWorkspace = (): Workspace => ({ name: "My fleet", inputs: [], documents: [], vinSpecs: {}, updated: new Date().toISOString() });

export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    return ((await tx("kv", "readonly", (s) => s.get("workspace"))) as Workspace | undefined) ?? null;
  } catch {
    return null;   // private mode or storage blocked: the app still works, it just won't remember
  }
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put({ ...ws, updated: new Date().toISOString() }, "workspace"));
}

export async function saveFile(id: string, blob: Blob): Promise<void> {
  await tx("files", "readwrite", (s) => s.put(blob, id));
}

export async function loadFile(id: string): Promise<Blob | null> {
  return ((await tx("files", "readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
}

export async function deleteFile(id: string): Promise<void> {
  await tx("files", "readwrite", (s) => s.delete(id));
}

export async function clearWorkspace(): Promise<void> {
  await tx("kv", "readwrite", (s) => s.clear());
  await tx("files", "readwrite", (s) => s.clear());
  // Procedure notes can contain fleet references too; include them in the delete-data action.
  for (const key of Object.keys(localStorage)) if (key.startsWith("fleetops:sop:")) localStorage.removeItem(key);
}

/** Ask the browser not to evict the fleet's data under storage pressure. */
export async function persistStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Documents as CSV rows for the pipeline's `documents` table (only those the owner confirmed). */
export function documentsCsv(docs: SavedDocument[]): string | null {
  const ok = docs.filter((d) => d.confirmed);
  if (!ok.length) return null;
  const q = (v: string | null) => (v === null ? "" : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = "document_id,vehicle_ref,doc_type,document_number,issue_date,expiry_date,issuer,file_name";
  return [head, ...ok.map((d) => [d.id, d.vehicle_ref, d.doc_type, d.document_number, d.issue_date, d.expiry_date, d.issuer, d.file_name].map(q).join(","))].join("\n");
}

/** Vehicles the owner created from cards that matched nothing in the list. */
export function vehiclesFromDocuments(docs: SavedDocument[]): string | null {
  const rows = new Map<string, string[]>();
  for (const d of docs) {
    if (!d.confirmed || !d.create_vehicle) continue;
    const id = (d.plate || d.vin || d.vehicle_ref || "").trim();
    if (id && !rows.has(id)) rows.set(id, [id, d.plate ?? "", d.vin ?? ""]);
  }
  if (!rows.size) return null;
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ["vehicle_id,plate_number,vin", ...[...rows.values()].map((r) => r.map(q).join(","))].join("\n");
}

export const hasFleet = (ws: Workspace | null) => !!ws && (ws.inputs.length > 0 || ws.documents.some((d) => d.confirmed && d.create_vehicle));

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

