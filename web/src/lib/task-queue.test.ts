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
