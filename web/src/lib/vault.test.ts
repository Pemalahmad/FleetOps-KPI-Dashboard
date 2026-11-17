import { describe, expect, it } from "vitest";
import { isSealed, newVault, openVault, passphraseProblem, seal, sealJson, unseal, unsealJson } from "./vault";

// the real 600k-iteration KDF runs once here; the rest reuse its key
const PASS = "correct horse battery staple";
const vault = newVault(PASS);

describe("vault: encryption at rest", () => {
  it("opens with the right passphrase and refuses a wrong one", async () => {
    const { header } = await vault;
    expect(header.iterations).toBeGreaterThanOrEqual(600_000);
    expect(header.salt).toHaveLength(16);
    expect(await openVault(header, PASS)).not.toBeNull();
    expect(await openVault(header, "correct horse battery stapler")).toBeNull();
    expect(await openVault(header, "")).toBeNull();
  }, 30_000);

  it("round-trips a workspace, including binary fields, and stores no plaintext", async () => {
    const { key } = await vault;
    const ws = { name: "Al Fajr", inputs: [{ id: "a", bytes: new Uint8Array([0, 1, 254, 255]), csv: "vin\n5YJ3E1EB6PF100002" }] };
    const s = await sealJson(key, ws);
    expect(isSealed(s)).toBe(true);
    const bytes = new TextDecoder("latin1").decode(new Uint8Array(s.ct));
    expect(bytes).not.toContain("Al Fajr");
    expect(bytes).not.toContain("5YJ3E1EB6PF100002");
    const back = await unsealJson<typeof ws>(key, s);
    expect(back.name).toBe("Al Fajr");
    expect(back.inputs[0].bytes).toBeInstanceOf(Uint8Array);
    expect([...back.inputs[0].bytes]).toEqual([0, 1, 254, 255]);
  });

  it("uses a fresh IV per record", async () => {
    const { key } = await vault;
    const a = await seal(key, new Uint8Array([1, 2, 3]));
    const b = await seal(key, new Uint8Array([1, 2, 3]));
    expect([...a.iv]).not.toEqual([...b.iv]);
    expect(new Uint8Array(a.ct)).not.toEqual(new Uint8Array(b.ct));
  });
  it("protects garage incidents, reviewer notes and handover history with the workspace", async () => {
    const { key } = await vault;
    const workspace = { name: "Fleet", garage: { incidents: [{ summary: "Private incident reference" }], reviews: { V1: { owner: "Private reviewer", notes: "Private repair evidence" } }, handovers: [] } };
    const stored = await sealJson(key, workspace);
    const raw = new TextDecoder().decode(stored.ct);
    expect(raw).not.toContain("Private incident");
    expect(raw).not.toContain("Private reviewer");
    expect(await unsealJson(key, stored)).toEqual(workspace);
  });

  it("detects tampering (GCM tag)", async () => {
    const { key } = await vault;
    const s = await seal(key, new TextEncoder().encode("registration expires 2027-11-01"), "text/plain");
    const ct = new Uint8Array(s.ct.slice(0));
    ct[3] ^= 0x01;
    await expect(unseal(key, { ...s, ct: ct.buffer })).rejects.toThrow();
    expect(s.type).toBe("text/plain");
  });

  it("asks for a long passphrase that is typed twice", () => {
    expect(passphraseProblem("short", "short")).toMatch(/12 characters/);
    expect(passphraseProblem("aaaaaaaaaaaaaa", "aaaaaaaaaaaaaa")).toMatch(/repeating/);
    expect(passphraseProblem("blue lorry midnight", "blue lorry midnite")).toMatch(/match/);
    expect(passphraseProblem("blue lorry midnight", "blue lorry midnight")).toBeNull();
  });
});

