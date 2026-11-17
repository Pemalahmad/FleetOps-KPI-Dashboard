/**
 * Encryption at rest for the owner's fleet data (opt-in, passphrase).
 *
 * Key:   PBKDF2-HMAC-SHA-256, 600,000 iterations (OWASP 2023 guidance), 16-byte random salt -> AES-256-GCM key.
 *        The key is non-extractable and lives only in this tab's memory; the passphrase is never stored.
 * Data:  every record is sealed with AES-256-GCM and a fresh 12-byte IV; GCM's tag detects any tampering.
 * Check: a known value sealed with the key tells a wrong passphrase from a right one without decrypting the fleet.
 *
 * Built only on WebCrypto (browser and Node 20+), no dependencies.
 */

export const KDF_ITERATIONS = 600_000;
const CHECK = "fleetops-vault-v1";
const subtle = () => globalThis.crypto.subtle;

export interface Sealed {
  sealed: true;
  iv: Uint8Array;
  ct: ArrayBuffer;
  /** MIME type of a sealed file, so it can be restored as the same Blob. */
  type?: string;
}

export interface VaultHeader {
  v: 1;
  salt: Uint8Array;
  iterations: number;
  check: Sealed;
}

export const isSealed = (x: unknown): x is Sealed => !!x && typeof x === "object" && (x as Sealed).sealed === true;

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, data: Uint8Array | ArrayBuffer, type?: string): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
  return type === undefined ? { sealed: true, iv, ct } : { sealed: true, iv, ct, type };
}

/** Throws if the key is wrong or the record was altered. */
export async function unseal(key: CryptoKey, s: Sealed): Promise<ArrayBuffer> {
  return subtle().decrypt({ name: "AES-GCM", iv: s.iv as BufferSource }, key, s.ct);
}

export async function newVault(passphrase: string): Promise<{ header: VaultHeader; key: CryptoKey }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  return { key, header: { v: 1, salt, iterations: KDF_ITERATIONS, check: await seal(key, new TextEncoder().encode(CHECK)) } };
}

/** The key for this vault, or null if the passphrase is wrong. */
export async function openVault(header: VaultHeader, passphrase: string): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, header.salt, header.iterations);
  try {
    return new TextDecoder().decode(await unseal(key, header.check)) === CHECK ? key : null;
  } catch {
    return null;
  }
}

// JSON that keeps Uint8Array fields (parquet / json inputs) intact
const replacer = (_: string, v: unknown) => (v instanceof Uint8Array ? { __u8: toB64(v) } : v);
const reviver = (_: string, v: unknown) => (v && typeof v === "object" && "__u8" in (v as object) ? fromB64((v as { __u8: string }).__u8) : v);

export async function sealJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  return seal(key, new TextEncoder().encode(JSON.stringify(value, replacer)));
}

export async function unsealJson<T>(key: CryptoKey, s: Sealed): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await unseal(key, s)), reviver) as T;
}

function toB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b: string): Uint8Array {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** Rough passphrase check shown before protecting: length matters most. */
export function passphraseProblem(p: string, repeat: string): string | null {
  if (p.length < 12) return "Use at least 12 characters; a few unrelated words works well.";
  if (/^(.)\1+$/.test(p)) return "Avoid repeating one character.";
  if (p !== repeat) return "The two passphrases don't match.";
  return null;
}
