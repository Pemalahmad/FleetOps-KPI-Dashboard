import { expect, it } from "vitest";
import { createTaskQueue } from "./task-queue";

it("keeps a second warehouse mutation waiting for the first to finish", async () => {
  const queue = createTaskQueue(), events: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const first = queue(async () => { events.push("load A"); await held; events.push("build A"); });
  const second = queue(async () => { events.push("load B"); });
  await Promise.resolve();
  expect(events).toEqual(["load A"]);
  release(); await Promise.all([first, second]);
  expect(events).toEqual(["load A", "build A", "load B"]);
});
it("allows recovery after a failed run", async () => {
  const queue = createTaskQueue();
  await expect(queue(async () => { throw new Error("bad import"); })).rejects.toThrow("bad import");
  await expect(queue(async () => "recovered")).resolves.toBe("recovered");
});

// The engine provider's commit() runs each change inside this queue against the latest saved workspace.
it("keeps both of two saves that start together (a followed file re-import and a document scan)", async () => {
  const queue = createTaskQueue();
  let saved = { inputs: ["fleet.xlsx v1"], documents: [] as string[] };
  const slowDisk = () => new Promise((r) => setTimeout(r, 5));
  const commit = (change: (c: typeof saved) => typeof saved) => queue(async () => {
    const next = change(saved);
    await slowDisk();
    saved = next;
  });
  await Promise.all([
    commit((c) => ({ ...c, inputs: ["fleet.xlsx v2"] })),
    commit((c) => ({ ...c, documents: [...c.documents, "registration.jpg"] })),
  ]);
  expect(saved).toEqual({ inputs: ["fleet.xlsx v2"], documents: ["registration.jpg"] });
});
