import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSealed } from "./vault";

type WS = typeof import("./workspace");
let ws: WS;

const PASS = "correct horse battery staple";

function raw(store: "kv" | "files", key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fleetops-workspace", 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, get = db.transaction(store).objectStore(store).get(key);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

async function seedPlain() {
  const w = ws.emptyWorkspace();
  w.name = "Plain fleet";
  await ws.saveWorkspace(w);
  await ws.saveFile("doc-1", new Blob(["registration card"], { type: "text/plain" }));
  await ws.saveFile("doc-2", new Blob(["insurance card"], { type: "text/plain" }));
}

/** Make the n-th object-store write (counting from 1) throw, as a closed tab or full disk would. */
function failNthPut(n: number) {
  const put = IDBObjectStore.prototype.put;
  let calls = 0;
  return vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
    if (++calls === n) throw new DOMException("Injected write failure", "QuotaExceededError");
    return put.apply(this, args);
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  ws = await import("./workspace");
});
afterEach(() => vi.restoreAllMocks());

describe("passphrase protection is all-or-nothing", () => {
  it("seals the workspace and every file", async () => {
    await seedPlain();
    await ws.protectWorkspace(PASS);
    expect(await raw("kv", "vault")).toBeTruthy();
    expect(isSealed(await raw("kv", "workspace"))).toBe(true);
    expect(isSealed(await raw("files", "doc-1"))).toBe(true);
    expect(isSealed(await raw("files", "doc-2"))).toBe(true);
  });

  for (const step of [1, 2, 3, 4]) {
    it(`a failure at write ${step} leaves the fleet unprotected and intact, never half-sealed`, async () => {
      await seedPlain();
      failNthPut(step);
      await expect(ws.protectWorkspace(PASS)).rejects.toThrow();
      vi.restoreAllMocks();
      expect(await raw("kv", "vault")).toBeUndefined();
      expect((await raw("kv", "workspace")) as { name: string }).toMatchObject({ name: "Plain fleet" });
      expect(isSealed(await raw("files", "doc-1"))).toBe(false);
      expect(isSealed(await raw("files", "doc-2"))).toBe(false);
      expect(await ws.vaultStatus()).toBe("none");
    });
  }

  for (const step of [1, 2, 3]) {
    it(`a failure at write ${step} while removing the passphrase keeps everything sealed and protected`, async () => {
      await seedPlain();
      await ws.protectWorkspace(PASS);
      failNthPut(step);
      await expect(ws.unprotectWorkspace()).rejects.toThrow();
      vi.restoreAllMocks();
      expect(await raw("kv", "vault")).toBeTruthy();
      expect(isSealed(await raw("kv", "workspace"))).toBe(true);
      expect(isSealed(await raw("files", "doc-1"))).toBe(true);
      expect(isSealed(await raw("files", "doc-2"))).toBe(true);
    });
  }

  it("removing the passphrase stores everything readable again", async () => {
    await seedPlain();
    await ws.protectWorkspace(PASS);
    await ws.unprotectWorkspace();
    expect(await raw("kv", "vault")).toBeUndefined();
    expect(isSealed(await raw("kv", "workspace"))).toBe(false);
    expect(isSealed(await raw("files", "doc-1"))).toBe(false);
  });
});

describe("a fleet left half-sealed by an earlier version", () => {
  async function halfSealed() {
    await seedPlain();
    await ws.protectWorkspace(PASS);
    // Simulate the old bug: the header exists but one file and the workspace are still in the clear.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("fleetops-workspace", 1);
      req.onsuccess = () => {
        const db = req.result, t = db.transaction(["kv", "files"], "readwrite");
        t.objectStore("kv").put({ ...ws.emptyWorkspace(), name: "Leaked fleet" }, "workspace");
        t.objectStore("files").put(new Blob(["leaked card"]), "doc-2");
        t.oncomplete = () => { db.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
    });
    ws.lockVault();
  }

  it("stays closed without the passphrase", async () => {
    await halfSealed();
    expect(await ws.vaultStatus()).toBe("locked");
    expect(await ws.loadWorkspace()).toBeNull();
    await expect(ws.loadFile("doc-2")).rejects.toThrow(/locked/);
  });

  it("is sealed completely as soon as the passphrase is entered", async () => {
    await halfSealed();
    expect(await ws.unlockVault("wrong passphrase")).toBe(false);
    expect(isSealed(await raw("kv", "workspace"))).toBe(false);
    expect(await ws.unlockVault(PASS)).toBe(true);
    expect(isSealed(await raw("kv", "workspace"))).toBe(true);
    expect(isSealed(await raw("files", "doc-2"))).toBe(true);
    expect((await ws.loadWorkspace())?.name).toBe("Leaked fleet");
  });
});
