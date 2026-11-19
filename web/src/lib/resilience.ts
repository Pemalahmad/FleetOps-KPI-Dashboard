/**
 * Small resilience primitives used by FleetOps and shown on the System design page.
 *
 * - CircuitBreaker: stops calling a failing service for a cool-down, then lets one trial call through.
 * - RateLimiter: a token bucket, so bursts are allowed but the average rate stays under a limit.
 * - MessageQueue: a bounded in-memory publish/subscribe queue with acknowledgements and drop-oldest backpressure.
 *
 * Everything takes an injectable clock so tests are exact. Nothing here talks to the network.
 */
export type Clock = () => number;

/* ------------------------------------------------------------------------------------------- circuit breaker */
export type BreakerState = "closed" | "open" | "half-open";
export interface BreakerOptions { failureThreshold?: number; coolDownMs?: number; now?: Clock }

export class CircuitOpenError extends Error {
  constructor(public retryInMs: number) {
    super(`Paused after repeated failures. Try again in ${Math.max(1, Math.ceil(retryInMs / 1000))} s.`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private _state: BreakerState = "closed";
  private trialInFlight = false;
  readonly failureThreshold: number;
  readonly coolDownMs: number;
  private readonly now: Clock;
  private listeners = new Set<(s: BreakerState) => void>();

  constructor(o: BreakerOptions = {}) {
    this.failureThreshold = o.failureThreshold ?? 3;
    this.coolDownMs = o.coolDownMs ?? 30_000;
    this.now = o.now ?? Date.now;
  }

  /** The current state, moving from open to half-open once the cool-down has passed. */
  get state(): BreakerState {
    if (this._state === "open" && this.now() - this.openedAt >= this.coolDownMs) this.set("half-open");
    return this._state;
  }
  get consecutiveFailures() { return this.failures; }
  /** Milliseconds until an open breaker lets a trial call through; 0 when calls are allowed. */
  retryInMs(): number { return this.state === "open" ? Math.max(0, this.coolDownMs - (this.now() - this.openedAt)) : 0; }

  onChange(l: (s: BreakerState) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private set(s: BreakerState) { if (s !== this._state) { this._state = s; this.listeners.forEach((l) => l(s)); } }

  /** Run `fn` through the breaker. Throws CircuitOpenError without calling `fn` while the breaker is open. */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    const st = this.state;
    if (st === "open" || (st === "half-open" && this.trialInFlight)) throw new CircuitOpenError(this.retryInMs() || this.coolDownMs);
    const trial = st === "half-open";
    if (trial) this.trialInFlight = true;
    try {
      const v = await fn();
      this.failures = 0; this.set("closed");
      return v;
    } catch (e) {
      this.failures++;
      if (trial || this.failures >= this.failureThreshold) { this.openedAt = this.now(); this.set("open"); }
      throw e;
    } finally {
      if (trial) this.trialInFlight = false;
    }
  }

  reset() { this.failures = 0; this.trialInFlight = false; this.set("closed"); }
}

/* ------------------------------------------------------------------------------------------- rate limiter */
export interface LimiterOptions { capacity: number; refillPerSec: number; now?: Clock }

/** Token bucket: holds up to `capacity` tokens, refilled at `refillPerSec`; each call spends one. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly now: Clock;
  constructor(private o: LimiterOptions) { this.now = o.now ?? Date.now; this.tokens = o.capacity; this.last = this.now(); }
  private refill() {
    const t = this.now(), add = ((t - this.last) / 1000) * this.o.refillPerSec;
    this.tokens = Math.min(this.o.capacity, this.tokens + add); this.last = t;
  }
  get available(): number { this.refill(); return Math.floor(this.tokens); }
  /** Take a token if one is free. */
  tryTake(): boolean { this.refill(); if (this.tokens >= 1) { this.tokens -= 1; return true; } return false; }
  /** Milliseconds until the next token is free (0 if one is free now). */
  waitMs(): number { this.refill(); return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.o.refillPerSec) * 1000); }
  /** Wait for a token, then take it. */
  async take(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
    while (!this.tryTake()) await sleep(this.waitMs());
  }
}

/* ------------------------------------------------------------------------------------------- message queue */
export interface Message<T> { id: number; topic: string; body: T; at: number; attempts: number }
export interface QueueOptions { capacity?: number; now?: Clock }

/**
 * A bounded queue per topic. Publishers never block: past `capacity`, the oldest unacknowledged message is dropped
 * (and counted). Subscribers are pushed every new message; pull consumers take() and must ack() or nack() it.
 */
export class MessageQueue<T = unknown> {
  private seq = 0;
  private queues = new Map<string, Message<T>[]>();
  private inFlight = new Map<number, Message<T>>();
  private subs = new Map<string, Set<(m: Message<T>) => void>>();
  readonly capacity: number;
  dropped = 0;
  private readonly now: Clock;
  constructor(o: QueueOptions = {}) { this.capacity = o.capacity ?? 100; this.now = o.now ?? Date.now; }

  publish(topic: string, body: T): Message<T> {
    const m: Message<T> = { id: ++this.seq, topic, body, at: this.now(), attempts: 0 };
    const q = this.queues.get(topic) ?? [];
    q.push(m);
    while (q.length > this.capacity) { q.shift(); this.dropped++; }
    this.queues.set(topic, q);
    this.subs.get(topic)?.forEach((s) => s(m));
    return m;
  }
  subscribe(topic: string, fn: (m: Message<T>) => void) {
    const set = this.subs.get(topic) ?? new Set();
    set.add(fn); this.subs.set(topic, set);
    return () => { set.delete(fn); };
  }
  /** Take the oldest waiting message on a topic; it stays in flight until acked or nacked. */
  take(topic: string): Message<T> | null {
    const m = this.queues.get(topic)?.shift() ?? null;
    if (m) { m.attempts++; this.inFlight.set(m.id, m); }
    return m;
  }
  ack(id: number): boolean { return this.inFlight.delete(id); }
  /** Put an in-flight message back at the front, for another attempt. */
  nack(id: number): boolean {
    const m = this.inFlight.get(id);
    if (!m) return false;
    this.inFlight.delete(id);
    const q = this.queues.get(m.topic) ?? [];
    q.unshift(m); this.queues.set(m.topic, q);
    return true;
  }
  depth(topic: string): number { return this.queues.get(topic)?.length ?? 0; }
  get inFlightCount(): number { return this.inFlight.size; }
}
