/**
 * The owner's fleet, kept in this browser (IndexedDB). Nothing is sent anywhere: the imported sheets, the
 * column mappings, the scanned documents (with their image or PDF) and any VIN decodes stay on this device,
 * and the pipeline rebuilds from them on every visit.
 */
import type { VinSpec } from "./vin";
import type { GarageState } from "./garage";
import { isSealed, newVault, openVault, seal, sealJson, unseal, unsealJson, type Sealed, type VaultHeader } from "./vault";

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
  /** Operational reviews share the workspace's existing encrypted storage boundary. */
  garage?: GarageState;
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

// ---- encryption at rest (see vault.ts) ---------------------------------------------------------------------------
// When the owner sets a passphrase, the workspace and every file are stored sealed with AES-256-GCM. The key is held
// only in this module's memory; after a reload the vault is locked until the passphrase is entered again.
let vaultKey: CryptoKey | null = null;

export type VaultStatus = "none" | "locked" | "unlocked";

const readVault = async () => ((await tx("kv", "readonly", (s) => s.get("vault"))) as VaultHeader | undefined) ?? null;

export async function vaultStatus(): Promise<VaultStatus> {
  try {
    if (!(await readVault())) return "none";
  } catch {
    return "none";
  }
  return vaultKey ? "unlocked" : "locked";
}

/** True when the passphrase was right; the fleet can then be loaded. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const header = await readVault();
  if (!header) return true;
  const key = await openVault(header, passphrase);
  if (key) vaultKey = key;
  return !!key;
}

/** Forget the key: the data stays sealed until the passphrase is entered again. */
export function lockVault() {
  vaultKey = null;
}

async function allFileIds(): Promise<string[]> {
  return ((await tx("files", "readonly", (s) => s.getAllKeys())) as IDBValidKey[]).map(String);
}

/** Protect the saved fleet with a passphrase: seals the workspace and every stored file. */
export async function protectWorkspace(passphrase: string): Promise<void> {
  if (await readVault()) throw new Error("This fleet is already protected.");
  const ws = await loadWorkspace();
  const files = await Promise.all((await allFileIds()).map(async (id) => [id, await loadFile(id)] as const));
  const { header, key } = await newVault(passphrase);
  // header first: if the tab closes midway, unsealed and sealed records are both still readable with the key
  await tx("kv", "readwrite", (s) => s.put(header, "vault"));
  vaultKey = key;
  for (const [id, blob] of files) if (blob) await saveFile(id, blob);
  if (ws) await saveWorkspace(ws);
}

/** Remove the passphrase (vault must be unlocked): stores everything unsealed again. */
export async function unprotectWorkspace(): Promise<void> {
  if (!vaultKey) throw new Error("Unlock the fleet first.");
  const ws = await loadWorkspace();
  const files = await Promise.all((await allFileIds()).map(async (id) => [id, await loadFile(id)] as const));
  // write everything unsealed first, then drop the header, so nothing is ever left sealed without a way to open it
  for (const [id, blob] of files) if (blob) await tx("files", "readwrite", (s) => s.put(blob, id));
  if (ws) await tx("kv", "readwrite", (s) => s.put({ ...ws, updated: new Date().toISOString() }, "workspace"));
  await tx("kv", "readwrite", (s) => s.delete("vault"));
  vaultKey = null;
}

class VaultLocked extends Error {
  constructor() {
    super("Your fleet data is locked. Enter the passphrase on the Plan & offline page.");
  }
}

/** Never write unsealed data over a protected fleet. */
async function writeKey(): Promise<CryptoKey | null> {
  if (vaultKey) return vaultKey;
  if (await readVault()) throw new VaultLocked();
  return null;
}

export async function loadWorkspace(): Promise<Workspace | null> {
  let raw: unknown;
  try {
    raw = await tx("kv", "readonly", (s) => s.get("workspace"));
  } catch {
    return null;   // private mode or storage blocked: the app still works, it just won't remember
  }
  if (!raw) return null;
  if (!isSealed(raw)) return raw as Workspace;
  if (!vaultKey) return null;   // locked: the caller checks vaultStatus()
  return unsealJson<Workspace>(vaultKey, raw);
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  const key = await writeKey();
  const value = { ...ws, updated: new Date().toISOString() };
  const stored = key ? await sealJson(key, value) : value;
  await tx("kv", "readwrite", (s) => s.put(stored, "workspace"));
}

export async function saveFile(id: string, blob: Blob): Promise<void> {
  const key = await writeKey();
  const stored = key ? await seal(key, await blob.arrayBuffer(), blob.type) : blob;
  await tx("files", "readwrite", (s) => s.put(stored, id));
}

export async function loadFile(id: string): Promise<Blob | null> {
  const raw = (await tx("files", "readonly", (s) => s.get(id))) as Blob | Sealed | undefined;
  if (!raw) return null;
  if (!isSealed(raw)) return raw;
  if (!vaultKey) throw new VaultLocked();
  return new Blob([await unseal(vaultKey, raw)], { type: raw.type ?? "" });
}

export async function deleteFile(id: string): Promise<void> {
  await tx("files", "readwrite", (s) => s.delete(id));
}

/** Delete everything, including the passphrase protection (also the way out of a forgotten passphrase). */
export async function clearWorkspace(): Promise<void> {
  await tx("kv", "readwrite", (s) => s.clear());
  await tx("files", "readwrite", (s) => s.clear());
  // Procedure notes can contain fleet references too; include them in the delete-data action.
  for (const key of Object.keys(localStorage)) if (key.startsWith("fleetops:sop:")) localStorage.removeItem(key);
  vaultKey = null;
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


