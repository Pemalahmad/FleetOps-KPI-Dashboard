/**
 * Plans and licence keys, verified offline.
 *
 * Today the gate is OPEN: every feature is unlocked for everyone (early access). The machinery to charge later is
 * already here and tested: a licence key is `base64url(payload).base64url(signature)`, signed with the publisher's
 * Ed25519 private key (kept off the repo; see `fleetkpi license issue`) and verified in the browser with the public
 * key below, so the downloadable offline version can check a plan without calling any server.
 *
 * To start charging: set GATE_OPEN to false, decide what each plan includes in PLAN_FEATURES, and issue keys.
 */

export const GATE_OPEN = true;

/** Ed25519 public key (raw, base64url). Pair of the private key held by the publisher, never committed. */
export const PUBLIC_KEY = "qL-pMx9VdSnNOoUrZgagCj-qwguLJzUWMhbWHNVqQYU";

export type Plan = "early-access" | "free" | "starter" | "pro";
export type Feature =
  | "import" | "documents" | "vin-decode" | "register" | "operations" | "network" | "export" | "reminders" | "offline";

const ALL: Feature[] = ["import", "documents", "vin-decode", "register", "operations", "network", "export", "reminders", "offline"];

/** What each plan unlocks once the gate closes. A starting point to tune, not a promise. */
export const PLAN_FEATURES: Record<Plan, { features: Feature[]; maxVehicles: number | null }> = {
  "early-access": { features: ALL, maxVehicles: null },
  free: { features: ["import", "register", "documents", "export"], maxVehicles: 10 },
  starter: { features: ["import", "register", "documents", "export", "reminders", "vin-decode", "offline"], maxVehicles: 100 },
  pro: { features: ALL, maxVehicles: null },
};

export interface LicensePayload {
  sub: string;          // customer reference
  plan: Exclude<Plan, "early-access">;
  max_vehicles?: number | null;
  exp: string;          // ISO date, inclusive
  iat?: string;
}

export interface Entitlement {
  plan: Plan;
  open: boolean;        // true while the gate is open
  valid: boolean;
  reason: string | null;
  customer: string | null;
  expires: string | null;
  maxVehicles: number | null;
  can: (f: Feature) => boolean;
}

const b64urlToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

function entitlement(plan: Plan, extra: Partial<Entitlement> = {}): Entitlement {
  const spec = PLAN_FEATURES[plan];
  const max = extra.maxVehicles !== undefined ? extra.maxVehicles : spec.maxVehicles;
  return {
    plan, open: GATE_OPEN, valid: true, reason: null, customer: null, expires: null, maxVehicles: max,
    can: (f) => GATE_OPEN || spec.features.includes(f), ...extra,
  };
}

/** Verify a key against a public key; returns the payload or a reason it is not valid. */
export async function verifyKey(key: string, publicKey = PUBLIC_KEY, today = new Date()):
  Promise<{ ok: true; payload: LicensePayload } | { ok: false; reason: string }> {
  const [p, s] = key.trim().split(".");
  if (!p || !s) return { ok: false, reason: "That is not a licence key." };
  let payload: LicensePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return { ok: false, reason: "That is not a licence key." };
  }
  try {
    const k = await crypto.subtle.importKey("raw", b64urlToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const good = await crypto.subtle.verify({ name: "Ed25519" }, k, b64urlToBytes(s), new TextEncoder().encode(p));
    if (!good) return { ok: false, reason: "The key's signature does not match. It may have been altered." };
  } catch {
    return { ok: false, reason: "This browser cannot check licence keys (Ed25519 unsupported). Update the browser." };
  }
  if (!PLAN_FEATURES[payload.plan as Plan] || payload.plan === ("early-access" as never)) return { ok: false, reason: "Unknown plan." };
  if (new Date(`${payload.exp}T23:59:59Z`) < today) return { ok: false, reason: `This key expired on ${payload.exp}.` };
  return { ok: true, payload };
}

const STORE = "fleetops-license-key";

export async function currentEntitlement(): Promise<Entitlement> {
  if (GATE_OPEN) return entitlement("early-access");
  let key: string | null = null;
  try {
    key = localStorage.getItem(STORE);
  } catch {
    /* storage blocked */
  }
  if (!key) return { ...entitlement("free"), valid: false, reason: "No licence key entered." };
  const v = await verifyKey(key);
  if (!v.ok) return { ...entitlement("free"), valid: false, reason: v.reason };
  return entitlement(v.payload.plan, { customer: v.payload.sub, expires: v.payload.exp,
    maxVehicles: v.payload.max_vehicles ?? PLAN_FEATURES[v.payload.plan].maxVehicles });
}

export async function saveKey(key: string): Promise<{ ok: boolean; reason: string | null }> {
  const v = await verifyKey(key);
  if (!v.ok) return { ok: false, reason: v.reason };
  try {
    localStorage.setItem(STORE, key.trim());
  } catch {
    return { ok: false, reason: "This browser blocks local storage, so the key cannot be remembered." };
  }
  return { ok: true, reason: null };
}
