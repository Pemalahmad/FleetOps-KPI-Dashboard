import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError, MessageQueue, RateLimiter } from "./resilience";

const clock = (start = 0) => { let t = start; const now = () => t; return { now, tick: (ms: number) => { t += ms; } }; };
const ok = () => Promise.resolve("ok");
const fail = () => Promise.reject(new Error("down"));

describe("CircuitBreaker", () => {
  it("opens after the failure threshold and refuses calls without running them", async () => {
    const c = clock(), b = new CircuitBreaker({ failureThreshold: 2, coolDownMs: 1000, now: c.now });
    await expect(b.call(fail)).rejects.toThrow("down");
    expect(b.state).toBe("closed");
    await expect(b.call(fail)).rejects.toThrow("down");
    expect(b.state).toBe("open");
    let ran = false;
    await expect(b.call(() => { ran = true; return ok(); })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(ran).toBe(false);
    expect(b.retryInMs()).toBe(1000);
  });
  it("goes half-open after the cool-down: a success closes it, a failure reopens it", async () => {
    const c = clock(), b = new CircuitBreaker({ failureThreshold: 1, coolDownMs: 500, now: c.now });
    await expect(b.call(fail)).rejects.toThrow();
    c.tick(500);
    expect(b.state).toBe("half-open");
    await expect(b.call(fail)).rejects.toThrow("down");
    expect(b.state).toBe("open");
    c.tick(500);
    await expect(b.call(ok)).resolves.toBe("ok");
    expect(b.state).toBe("closed");
    expect(b.consecutiveFailures).toBe(0);
  });
  it("a success resets the failure count while closed", async () => {
    const b = new CircuitBreaker({ failureThreshold: 2 });
    await expect(b.call(fail)).rejects.toThrow();
    await b.call(ok);
    await expect(b.call(fail)).rejects.toThrow();
    expect(b.state).toBe("closed");
  });
  it("lets only one trial call through while half-open", async () => {
    const c = clock(), b = new CircuitBreaker({ failureThreshold: 1, coolDownMs: 100, now: c.now });
    await expect(b.call(fail)).rejects.toThrow();
    c.tick(100);
    let release!: () => void;
    const slow = b.call(() => new Promise<string>((r) => { release = () => r("late"); }));
    await expect(b.call(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    await expect(slow).resolves.toBe("late");
    expect(b.state).toBe("closed");
  });
});

describe("RateLimiter", () => {
  it("allows a burst up to capacity, then refills at the set rate", () => {
    const c = clock(), r = new RateLimiter({ capacity: 3, refillPerSec: 2, now: c.now });
    expect([r.tryTake(), r.tryTake(), r.tryTake(), r.tryTake()]).toEqual([true, true, true, false]);
    expect(r.waitMs()).toBe(500);
    c.tick(500);
    expect(r.tryTake()).toBe(true);
    c.tick(10_000);
    expect(r.available).toBe(3);
  });
  it("take() waits for a token", async () => {
    const c = clock(), r = new RateLimiter({ capacity: 1, refillPerSec: 1, now: c.now });
    r.tryTake();
    const waits: number[] = [];
    await r.take(async (ms) => { waits.push(ms); c.tick(ms); });
    expect(waits).toEqual([1000]);
  });
});

describe("MessageQueue", () => {
  it("delivers to subscribers and to pull consumers with ack/nack", () => {
    const q = new MessageQueue<string>({ capacity: 10 });
    const seen: string[] = [];
    q.subscribe("trips", (m) => seen.push(m.body));
    q.publish("trips", "a"); q.publish("trips", "b");
    expect(seen).toEqual(["a", "b"]);
    const m = q.take("trips")!;
    expect(m.body).toBe("a");
    expect(q.inFlightCount).toBe(1);
    expect(q.nack(m.id)).toBe(true);
    const again = q.take("trips")!;
    expect(again.body).toBe("a");
    expect(again.attempts).toBe(2);
    expect(q.ack(again.id)).toBe(true);
    expect(q.depth("trips")).toBe(1);
  });
  it("drops the oldest messages past capacity and counts them", () => {
    const q = new MessageQueue<number>({ capacity: 3 });
    for (let i = 1; i <= 5; i++) q.publish("pings", i);
    expect(q.depth("pings")).toBe(3);
    expect(q.dropped).toBe(2);
    expect(q.take("pings")!.body).toBe(3);
  });
});
