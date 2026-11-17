import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const prefix = "fleetops:%2Ffleet%2F:";
function worker(fetcher = vi.fn().mockResolvedValue({ json: async () => ({ version: "new", core: [], ocr: [] }) })) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<unknown, Response>>();
  for (const name of ["another-app", prefix + "core-old", prefix + "core-new", prefix + "runtime"]) stores.set(name, new Map());
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { match: async (req: unknown) => store.get(req), put: async (req: unknown, response: Response) => { store.set(req, response); } };
    },
  };
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL, Response, Set, caches, fetch: fetcher,
    self: { registration: { scope: "https://example.test/fleet/" }, location: { origin: "https://example.test" },
      addEventListener: (event: string, fn: (e: unknown) => void) => { handlers[event] = fn; }, clients: { claim: async () => {} } },
  });
  return { handlers, stores };
}
describe("service-worker cache isolation", () => {
  it("deletes only obsolete FleetOps caches for its own scope", async () => {
    const { handlers, stores } = worker();
    let pending: Promise<unknown> | undefined;
    handlers.activate({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(stores.has("another-app")).toBe(true);
    expect(stores.has(prefix + "core-old")).toBe(false);
    expect(stores.has(prefix + "core-new")).toBe(true);
  });
  it("does not overwrite a working offline page with an HTTP failure", async () => {
    const { handlers, stores } = worker(vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    const request = { url: "https://example.test/fleet/", method: "GET", mode: "navigate" };
    stores.get(prefix + "runtime")!.set(request, new Response("working"));
    let pending: Promise<Response> | undefined;
    handlers.fetch({ request, respondWith: (promise: Promise<Response>) => { pending = promise; } });
    expect((await pending)!.status).toBe(404);
    expect(await stores.get(prefix + "runtime")!.get(request)!.text()).toBe("working");
  });
  it("returns an explicit offline error when nothing has been cached", async () => {
    const { handlers } = worker(vi.fn().mockRejectedValue(new Error("offline")));
    let pending: Promise<Response> | undefined;
    handlers.fetch({ request: { url: "https://example.test/fleet/missing/", method: "GET", mode: "navigate" },
      respondWith: (promise: Promise<Response>) => { pending = promise; } });
    expect((await pending)!.status).toBe(503);
  });
});
