import { CircuitBreaker, CircuitOpenError, RateLimiter } from "./resilience";
/**
 * VINs in the browser. The offline rules mirror the SQL macros in fleetkpi/sql/macros/01_vin.sql
 * (format, ISO 3779 check digit, model-year code); the optional online decode asks NHTSA's public vPIC
 * service for make, model, trim and specification, and only runs when the user asks for it.
 */

const VALUES: Record<string, number> = {};
"ABCDEFGH".split("").forEach((c, i) => (VALUES[c] = i + 1));
"JKLMN".split("").forEach((c, i) => (VALUES[c] = i + 1));
VALUES.P = 7;
VALUES.R = 9;
"STUVWXYZ".split("").forEach((c, i) => (VALUES[c] = i + 2));
for (let d = 0; d <= 9; d++) VALUES[String(d)] = d;
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export const cleanVin = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isVinFormat = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v);

export function checkDigit(vin: string): string {
  const sum = vin.split("").reduce((s, c, i) => s + VALUES[c] * WEIGHTS[i], 0);
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export type VinStatus = "Valid" | "Invalid format" | "Check digit mismatch" | "Missing";

export function vinStatus(raw: string | null | undefined): VinStatus {
  if (!raw) return "Missing";
  const v = cleanVin(raw);
  if (!isVinFormat(v)) return "Invalid format";
  if ("12345".includes(v[0]) && checkDigit(v) !== v[8]) return "Check digit mismatch";
  return "Valid";
}

/** Model year from the 10th character; the code repeats every 30 years, so take the latest year ≤ next year. */
export function vinModelYear(raw: string, asOf = new Date()): number | null {
  const v = cleanVin(raw);
  if (!isVinFormat(v)) return null;
  const i = YEAR_CODES.indexOf(v[9]);
  if (i < 0) return null;
  const limit = asOf.getFullYear() + 1;
  return 1980 + i + 30 * Math.floor((limit - 1980 - i) / 30);
}

/** Every substring of free text that is shaped like a VIN; OCR often reads O for 0 and I for 1, so those are repaired. */
export function findVins(text: string): string[] {
  const out = new Set<string>();
  const tokens = text.toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(" ");
  // VINs are sometimes split by OCR into neighbouring tokens: try single tokens and pairs.
  const candidates = [...tokens, ...tokens.slice(1).map((t, i) => tokens[i] + t)];
  for (const c of candidates) {
    if (c.length !== 17) continue;
    const fixed = c.replace(/[OQ]/g, "0").replace(/I/g, "1");
    if (isVinFormat(fixed) && /\d/.test(fixed) && /[A-Z]/.test(fixed)) out.add(fixed);
  }
  return [...out];
}

// ---------------------------------------------------------------------------------------- online decode
export interface VinSpec {
  vin: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  trim: string | null;
  configuration: string | null;
  powertrain: "BEV" | "PHEV" | "HEV" | "ICE" | null;
  fuel_type: string | null;
  note: string | null;
}

const blank = (s: unknown) => (typeof s === "string" && s.trim() && s.trim() !== "Not Applicable" ? s.trim() : null);

/** Turn one vPIC DecodeVINValuesBatch result into the fields the fleet register uses. */
export function specFromVpic(r: Record<string, string>): VinSpec {
  const elec = (r.ElectrificationLevel ?? "").toUpperCase();
  const fuel = (r.FuelTypePrimary ?? "").toLowerCase();
  const powertrain =
    elec.includes("BEV") || fuel === "electric" ? "BEV"
    : elec.includes("PHEV") ? "PHEV"
    : elec.includes("HEV") ? "HEV"
    : fuel ? "ICE" : null;
  // battery size describes a BEV or PHEV; for a hybrid or combustion vehicle the engine is the spec that matters
  const kwh = powertrain === "BEV" || powertrain === "PHEV" ? blank(r.BatteryKWh) : null;
  const litres = blank(r.DisplacementL), seats = blank(r.Seats);
  const parts = [
    kwh ? `${Number(kwh).toFixed(0)} kWh` : litres ? `${Number(litres).toFixed(1)}L${blank(r.FuelTypePrimary) ? " " + r.FuelTypePrimary.toLowerCase() : ""}` : null,
    blank(r.DriveType)?.replace(/\/.*$/, ""),
    blank(r.BodyClass),
    seats ? `${seats} seats` : null,
  ].filter(Boolean);
  return {
    vin: r.VIN,
    make: blank(r.Make), model: blank(r.Model), model_year: blank(r.ModelYear) ? Number(r.ModelYear) : null,
    trim: blank(r.Trim) ?? blank(r.Series), configuration: parts.length ? parts.join(" · ") : null, powertrain,
    fuel_type: fuel.includes("diesel") ? "diesel" : fuel.includes("gasoline") ? "petrol" : null,
    note: r.ErrorCode && !r.ErrorCode.startsWith("0") ? blank(r.ErrorText) : null,
  };
}

export const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/";

/**
 * Guards for the one outside service FleetOps calls. The rate limiter keeps batches polite (a burst of 3, then one every
 * 1.5 s); the circuit breaker stops after 3 failed batches in a row and pauses the decoder for 30 s, so a down or blocked
 * service is not hammered and the owner gets a clear message instead of a stream of errors.
 */
export const vpicLimiter = new RateLimiter({ capacity: 3, refillPerSec: 1 / 1.5 });
export const vpicBreaker = new CircuitBreaker({ failureThreshold: 3, coolDownMs: 30_000 });

/** Decode up to 50 VINs per request with NHTSA vPIC. Sends only the VINs. */
export async function decodeVins(vins: string[], onProgress?: (done: number) => void): Promise<VinSpec[]> {
  const out: VinSpec[] = [];
  for (let i = 0; i < vins.length; i += 50) {
    const body = new URLSearchParams({ format: "json", data: vins.slice(i, i + 50).join(";") });
    if (vpicBreaker.state === "open") throw new Error(`The VIN decoder is paused after repeated failures. Try again in ${Math.max(1, Math.ceil(vpicBreaker.retryInMs() / 1000))} seconds.`);
    await vpicLimiter.take();
    const json = await vpicBreaker.call(async () => {
      const res = await fetch(VPIC_URL, { method: "POST", body });
      if (!res.ok) throw new Error(`vPIC answered ${res.status}`);
      return (await res.json()) as { Results: Record<string, string>[] };
    }).catch((e: unknown) => {
      if (e instanceof CircuitOpenError) throw new Error(`The VIN decoder is paused after repeated failures. Try again in ${Math.max(1, Math.ceil(e.retryInMs / 1000))} seconds.`);
      throw e;
    });
    out.push(...json.Results.map(specFromVpic));
    onProgress?.(Math.min(i + 50, vins.length));
  }
  return out;
}
