/**
 * Property-based fuzzing (fast-check) of every boundary where untrusted input enters the app: imported spreadsheet
 * text, scanned document text, procedure Markdown, exported cells and encrypted records. Each property runs on
 * hundreds of generated inputs, including hostile ones (control characters, HTML, unicode, huge strings).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { safeCell } from "./exporters";
import { inlineMarkdown, markdown } from "./markdown";
import { headerRow, norm, toCsv, type Sheet } from "./sheets";
import { cleanVin, findVins, isVinFormat, vinStatus } from "./vin";
import { classify, extractFields, findDates } from "./docscan";
import { documentCurrent } from "./garage";
import { deriveKey, seal, sealJson, unseal, unsealJson } from "./vault";

const RUNS = { numRuns: 300 };
const hostile = fc.oneof(
  fc.string({ maxLength: 400 }),
  fc.string({ unit: "grapheme", maxLength: 200 }),
  fc.constantFrom("<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<svg/onload=alert(1)>",
    "[x](javascript:alert(1))", "[x](JaVaScRiPt:alert(1))", "<a href=\"javascript:alert(1)\">x</a>",
    "<iframe src=//evil.test>", "<style>*{}</style>", "=cmd|' /C calc'!A0", "\t=1+1", "\u0000‮"),
);

/** Minimal RFC 4180 reader, to check toCsv round-trips exactly. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { rows.at(-1)!.push(cell); cell = ""; }
    else if (c === "\n") { rows.at(-1)!.push(cell); cell = ""; rows.push([]); }
    else cell += c;
  }
  rows.at(-1)!.push(cell);
  return rows;
}

describe("fuzz: procedure Markdown never emits active content", () => {
  it("for any input", () => {
    fc.assert(fc.property(fc.array(hostile, { maxLength: 6 }).map((a) => a.join(" ")), (text) => {
      for (const html of [markdown(text), inlineMarkdown(text)]) {
        expect(html).not.toMatch(/<\s*(script|iframe|object|embed|img|svg|style|form|input|link|meta|base)\b/i);
        expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/href\s*=\s*"\s*(javascript|data|vbscript):/i);
      }
    }), RUNS);
  });
});

describe("fuzz: exported cells cannot start a spreadsheet formula", () => {
  it("for any text", () => {
    fc.assert(fc.property(hostile, (s) => {
      const out = safeCell(s);
      expect(typeof out).toBe("string");
      expect(String(out)).not.toMatch(/^[\t\r\n]|^\s*[=+\-@]/);
    }), RUNS);
  });
});

describe("fuzz: spreadsheet import", () => {
  const cell = fc.option(fc.string({ maxLength: 40 }), { nil: null });
  it("CSV for the engine round-trips every cell exactly", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 6 }).chain((w) => fc.record({
      headers: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: w, maxLength: w }),
      rows: fc.array(fc.array(cell, { minLength: w, maxLength: w }), { maxLength: 8 }),
    })), ({ headers, rows }) => {
      const sheet: Sheet = { id: "f", file: "f.xlsx", sheet: null, headers, rows, kind: "tabular" };
      const parsed = parseCsv(toCsv(sheet));
      expect(parsed[0]).toEqual(headers);
      expect(parsed.slice(1)).toEqual(rows.map((r) => r.map((v) => v ?? "")));
    }), RUNS);
  });
  it("column names normalise to safe, stable identifiers", () => {
    fc.assert(fc.property(hostile, (s) => {
      const n = norm(s);
      expect(n).toMatch(/^[a-z0-9_]*$/);
      expect(norm(n)).toBe(n);
    }), RUNS);
  });
  it("header detection stays within the sheet for any grid", () => {
    fc.assert(fc.property(fc.array(fc.array(fc.oneof(fc.string(), fc.integer(), fc.constant(null)), { maxLength: 8 }), { maxLength: 30 }), (grid) => {
      const i = headerRow(grid, new Set(["vin", "plate_number"]));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(Math.max(1, Math.min(15, grid.length)));
    }), RUNS);
  });
});

describe("fuzz: VINs and scanned documents", () => {
  it("VIN cleaning and status never throw and agree with the format rule", () => {
    fc.assert(fc.property(hostile, (s) => {
      const v = cleanVin(s);
      expect(v).toMatch(/^[A-Z0-9]*$/);
      const status = vinStatus(s);
      if (status === "Valid") expect(isVinFormat(v)).toBe(true);
      for (const found of findVins(s)) expect(isVinFormat(found)).toBe(true);
    }), RUNS);
  });
  it("OCR text parsing never throws on any text", () => {
    fc.assert(fc.property(fc.oneof(fc.array(hostile, { maxLength: 8 }).map((a) => a.join("\n")), fc.tuple(fc.integer({ min: 1, max: 31 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1990, max: 2040 })).map(([d, m, y]) => "Expiry " + d + "/" + m + "/" + y)), (text) => {
      for (const d of findDates(text)) expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      classify(text);
      extractFields(text, [{ vehicle_id: "V1", plate_number: "D 48213", vin: "5YJ3E1EA5PF100001" }]);
    }), RUNS);
  });
  it("document expiry is unknown, never guessed, for malformed dates", () => {
    fc.assert(fc.property(fc.string({ maxLength: 20 }), (s) => {
      const r = documentCurrent(s, "2026-11-18");
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) expect(r).toBeNull();
    }), RUNS);
  });
});

describe("fuzz: encryption at rest", () => {
  // a low iteration count keeps the fuzz fast; the real KDF strength is asserted in vault.test.ts
  const key = deriveKey("fuzz passphrase only", new Uint8Array(16), 1000);
  it("sealing round-trips any bytes and any tampering is detected", async () => {
    const k = await key;
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 2048 }), fc.nat(), async (bytes, flip) => {
      const s = await seal(k, bytes);
      expect(new Uint8Array(await unseal(k, s))).toEqual(bytes);
      const ct = new Uint8Array(s.ct.slice(0));
      ct[flip % ct.length] ^= 1 << (flip % 8);
      await expect(unseal(k, { ...s, ct: ct.buffer })).rejects.toThrow();
    }), { numRuns: 100 });
  });
  it("sealed JSON round-trips any workspace-shaped value", async () => {
    const k = await key;
    await fc.assert(fc.asyncProperty(fc.record({ name: fc.string(), notes: fc.dictionary(fc.string(), fc.string()), bytes: fc.uint8Array({ maxLength: 64 }) }), async (v) => {
      const back = await unsealJson<typeof v>(k, await sealJson(k, v));
      expect(back.name).toBe(v.name);
      expect(back.notes).toEqual(v.notes);
      expect([...back.bytes]).toEqual([...v.bytes]);
    }), { numRuns: 100 });
  });
});
