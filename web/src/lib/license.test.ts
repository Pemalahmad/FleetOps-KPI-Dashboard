import { describe, expect, it } from "vitest";
import { currentEntitlement, GATE_OPEN, PUBLIC_KEY, verifyKey } from "./license";

// Issued by `fleetkpi license issue` with the publisher's key; safe to publish (a key grants only what it says).
const GOOD = "eyJzdWIiOiJ0ZXN0LXN1aXRlIiwicGxhbiI6InN0YXJ0ZXIiLCJleHAiOiIyMDk5LTEyLTMxIiwiaWF0IjoiMjAyNi0xMS0xNyIsIm1heF92ZWhpY2xlcyI6MTAwfQ.v66x1TQ4BxohyYgEv7tJvtXS9P7X7P69I_dKSIrmerUxaO2RSfsxf2_GWi5tARTXY72dVCKoZiQFuaOrpc_rBA";
const EXPIRED = "eyJzdWIiOiJ0ZXN0LXN1aXRlIiwicGxhbiI6InBybyIsImV4cCI6IjIwMjAtMDEtMDEiLCJpYXQiOiIyMDI2LTExLTE3In0.GwdJxrTpayEpWoNTparDqWjlt3XE4ZSeoV5ih6BF3BoxDvJ7pPyMXeu9hH2B3MuHC30Oi8Se2uVcP1pcj3ZSDg";

describe("licence keys (signed in Python, verified here)", () => {
  it("accepts a genuine key", async () => {
    const v = await verifyKey(GOOD, PUBLIC_KEY);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload).toMatchObject({ sub: "test-suite", plan: "starter", max_vehicles: 100 });
  });
  it("rejects a key whose payload was edited (plan upgraded by hand)", async () => {
    const [p, s] = GOOD.split(".");
    const forged = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    forged.plan = "pro";
    const fp = btoa(JSON.stringify(forged)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const v = await verifyKey(`${fp}.${s}`, PUBLIC_KEY);
    expect(v.ok).toBe(false);
  });
  it("rejects expired keys and garbage", async () => {
    expect((await verifyKey(EXPIRED, PUBLIC_KEY)).ok).toBe(false);
    expect((await verifyKey("hello", PUBLIC_KEY)).ok).toBe(false);
  });
  it("while the gate is open, everyone has every feature", async () => {
    expect(GATE_OPEN).toBe(true);
    const e = await currentEntitlement();
    expect(e.plan).toBe("early-access");
    expect(e.can("network") && e.can("offline") && e.can("vin-decode")).toBe(true);
    expect(e.maxVehicles).toBeNull();
  });
});
