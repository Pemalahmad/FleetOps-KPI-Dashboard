"use client";

import "./system.css";
import { useEffect, useState } from "react";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import Button from "@/components/arc/button";
import { CircuitBreaker, MessageQueue, RateLimiter, type BreakerState } from "@/lib/resilience";
import { STATUS_TEXT, TOPICS } from "./topics";

/* ----------------------------------------------------------------------------------------------- architecture diagram */
interface Box { id: string; x: number; y: number; e: string; t: string; s: string; w?: number; hot?: boolean }
const BOXES: Box[] = [
  { id: "browser", x: 20, y: 70, e: "💻", t: "Owner's browser", s: "dashboards, garage" },
  { id: "vehicles", x: 20, y: 250, e: "🚚", t: "Vehicles", s: "telematics pings" },
  { id: "dns", x: 190, y: 70, e: "🌐", t: "DNS", s: "name → region" },
  { id: "cdn", x: 350, y: 10, e: "🗺️", t: "CDN", s: "app, engine, assets" },
  { id: "lb", x: 350, y: 160, e: "⚖️", t: "Load balancer", s: "health checks" },
  { id: "rl", x: 190, y: 250, e: "🚦", t: "Rate limiter", s: "per key, per vehicle" },
  { id: "api1", x: 520, y: 100, e: "🔧", t: "Garage API", s: "job cards" },
  { id: "api2", x: 520, y: 160, e: "📡", t: "Ingest API", s: "telematics" },
  { id: "api3", x: 520, y: 220, e: "📊", t: "Reports API", s: "KPIs" },
  { id: "cache", x: 690, y: 10, e: "⚡", t: "Cache", s: "KPI tiles" },
  { id: "queue", x: 690, y: 250, e: "📬", t: "Queue", s: "events, pings" },
  { id: "workers", x: 850, y: 250, e: "⚙️", t: "Workers", s: "ack after store" },
  { id: "primary", x: 690, y: 100, e: "🗄️", t: "Primary SQL", s: "writes, consistent", hot: true },
  { id: "replica", x: 850, y: 60, e: "🪞", t: "Read replicas", s: "dashboards" },
  { id: "shards", x: 850, y: 140, e: "🧩", t: "Shards", s: "trips by vehicle" },
  { id: "ts", x: 1010, y: 250, e: "📈", t: "Time-series", s: "GPS, CAN-bus" },
];
const W = 140, H = 46;
const at = (id: string) => BOXES.find((b) => b.id === id)!;
const right = (b: Box): [number, number] => [b.x + W, b.y + H / 2];
const left = (b: Box): [number, number] => [b.x, b.y + H / 2];
const top = (b: Box): [number, number] => [b.x + W / 2, b.y];
const bottom = (b: Box): [number, number] => [b.x + W / 2, b.y + H];
const curve = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => { const mx = (x1 + x2) / 2; return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`; };
const LINKS: [string, (b: Box) => [number, number], string, (b: Box) => [number, number], number][] = [
  ["browser", right, "dns", left, 2.2], ["dns", right, "cdn", left, 2.6], ["dns", right, "lb", left, 2.4], ["vehicles", right, "rl", left, 1.8],
  ["rl", right, "lb", left, 2.2], ["lb", right, "api1", left, 2], ["lb", right, "api2", left, 1.6], ["lb", right, "api3", left, 2.4],
  ["api1", right, "primary", left, 2.2], ["api3", right, "cache", left, 2.8], ["api2", right, "queue", left, 1.7], ["queue", right, "workers", left, 1.6],
  ["workers", right, "ts", left, 1.9], ["workers", top, "shards", bottom, 2.1], ["primary", right, "replica", left, 2.6], ["primary", right, "shards", left, 2.9],
];

function Architecture() {
  return (
    <div className="sys-diagram">
      <svg viewBox="0 0 1170 310" role="img" aria-label="Architecture of a hosted fleet platform: browsers and vehicles reach DNS, a CDN and a load balancer, then API services, a cache, a queue with workers, a primary SQL database with read replicas and shards, and a time-series store.">
        {LINKS.map(([a, fa, b, fb, dur], i) => {
          const d = curve(fa(at(a)), fb(at(b)));
          return (
            <g key={i}>
              <path d={d} className="sys-wire" />
              <circle r={3.6} className="sys-packet"><animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} begin={`${(i % 5) * 0.35}s`} /></circle>
            </g>
          );
        })}
        {BOXES.map((b) => (
          <g key={b.id} className={b.hot ? "sys-node sys-node-hot" : "sys-node"}>
            <rect x={b.x} y={b.y} width={W} height={H} rx={10} />
            <text x={b.x + 12} y={b.y + 29} fontSize={18}>{b.e}</text>
            <text x={b.x + 38} y={b.y + 20} className="sys-node-t">{b.t}</text>
            <text x={b.x + 38} y={b.y + 35} className="sys-node-s">{b.s}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- CAP and sharding */
function Cap() {
  return (
    <svg viewBox="0 0 300 220" className="sys-mini" role="img" aria-label="CAP triangle: consistency, availability and partition tolerance; job cards choose consistency, dashboards choose availability.">
      <path d="M150 20 L280 200 L20 200Z" className="sys-tri" />
      <circle cx={150} cy={20} r={16} className="sys-dot" /><text x={150} y={26} textAnchor="middle" fontSize={15}>🔒</text>
      <circle cx={280} cy={200} r={16} className="sys-dot" /><text x={280} y={206} textAnchor="middle" fontSize={15}>🟢</text>
      <circle cx={20} cy={200} r={16} className="sys-dot" /><text x={20} y={206} textAnchor="middle" fontSize={15}>✂️</text>
      <text x={172} y={25} className="sys-lab">Consistency</text>
      <text x={252} y={186} textAnchor="end" className="sys-lab">Availability</text>
      <text x={46} y={186} className="sys-lab">Partition</text>
      <g className="sys-pick"><rect x={58} y={92} width={92} height={24} rx={12} className="sys-chip sys-chip-c" /><text x={104} y={108} textAnchor="middle" className="sys-chip-t">Job cards: CP</text></g>
      <g className="sys-pick" style={{ animationDelay: "1.2s" }}><rect x={150} y={134} width={104} height={24} rx={12} className="sys-chip sys-chip-a" /><text x={202} y={150} textAnchor="middle" className="sys-chip-t">Dashboards: AP</text></g>
    </svg>
  );
}

function Shards() {
  const rows = [["V-0012", 0], ["V-0457", 1], ["V-2210", 2], ["V-3391", 0], ["V-5120", 1], ["V-6048", 2]] as const;
  return (
    <svg viewBox="0 0 300 240" className="sys-mini" role="img" aria-label="Sharding trips by a hash of vehicle id into three shards.">
      {[0, 1, 2].map((s) => (
        <g key={s}>
          <ellipse cx={230} cy={34 + s * 66} rx={44} ry={9} className="sys-db-top" />
          <path d={`M186 ${34 + s * 66} V${70 + s * 66} a44 9 0 0 0 88 0 V${34 + s * 66}`} className="sys-db" />
          <text x={230} y={62 + s * 66} textAnchor="middle" className="sys-lab">Shard {s + 1}</text>
        </g>
      ))}
      {rows.map(([v, s], i) => (
        <g key={v} className="sys-route" style={{ animationDelay: `${i * 0.5}s` }}>
          <rect x={10} y={14 + i * 32} width={78} height={22} rx={6} className="sys-chip" />
          <text x={49} y={29 + i * 32} textAnchor="middle" className="sys-chip-t">🚗 {v}</text>
          <path d={curve([88, 25 + i * 32], [186, 52 + s * 66])} className="sys-wire" />
        </g>
      ))}
      <text x={150} y={234} textAnchor="middle" className="sys-lab">shard = hash(vehicle_id) mod 3</text>
    </svg>
  );
}

/* ----------------------------------------------------------------------------------------------- live demos (real classes) */
const STATES: { id: BreakerState; x: number; e: string; label: string }[] = [
  { id: "closed", x: 60, e: "🟢", label: "Closed" }, { id: "open", x: 200, e: "🔴", label: "Open" }, { id: "half-open", x: 340, e: "🟡", label: "Half-open" },
];

function BreakerDemo() {
  const [breaker] = useState(() => new CircuitBreaker({ failureThreshold: 3, coolDownMs: 5000 }));
  const [, setTick] = useState(0);
  const [log, setLog] = useState<{ id: number; text: string; tone: "good" | "bad" | "warn" }[]>([]);
  const refresh = () => setTick((t) => t + 1);
  useEffect(() => breaker.onChange(refresh), [breaker]);
  useEffect(() => { const t = window.setInterval(refresh, 250); return () => window.clearInterval(t); }, []);
  const send = async (healthy: boolean) => {
    const id = Date.now() + Math.random();
    try {
      await breaker.call(() => (healthy ? Promise.resolve() : Promise.reject(new Error("service did not answer"))));
      setLog((l) => [{ id, text: "✅ Request succeeded", tone: "good" as const }, ...l].slice(0, 6));
    } catch (e) {
      const open = (e as Error).name === "CircuitOpenError";
      setLog((l) => [{ id, text: open ? `⛔ Not sent: ${(e as Error).message}` : "❌ Request failed", tone: open ? "warn" as const : "bad" as const }, ...l].slice(0, 6));
    }
    refresh();
  };
  const state = breaker.state, wait = Math.ceil(breaker.retryInMs() / 1000);
  return (
    <Card title="🔌 Circuit breaker, live" sub="The same class that guards the VIN decoder. Three failures open it; after 5 s it lets one trial call through.">
      <svg viewBox="0 0 400 110" className="sys-fsm" role="img" aria-label={`Circuit breaker state: ${state}`}>
        <path d="M86 44 C130 14 170 14 174 44" className="sys-wire" /><text x={130} y={16} textAnchor="middle" className="sys-lab">3 failures</text>
        <path d="M226 44 C270 14 310 14 314 44" className="sys-wire" /><text x={270} y={16} textAnchor="middle" className="sys-lab">cool-down</text>
        <path d="M314 76 C260 106 200 106 200 82" className="sys-wire" /><text x={262} y={106} textAnchor="middle" className="sys-lab">trial fails</text>
        <path d="M330 80 C250 124 80 124 66 82" className="sys-wire sys-wire-faint" />
        {STATES.map((s) => (
          <g key={s.id} className={state === s.id ? "sys-state sys-state-on" : "sys-state"}>
            <circle cx={s.x} cy={60} r={26} />
            <text x={s.x} y={57} textAnchor="middle" fontSize={16}>{s.e}</text>
            <text x={s.x} y={74} textAnchor="middle" className="sys-lab">{s.label}</text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void send(true)}>✅ Send a healthy request</Button>
        <Button variant="secondary" size="sm" onClick={() => void send(false)}>💥 Send a failing request</Button>
        <Button variant="ghost" size="sm" onClick={() => { breaker.reset(); setLog([]); refresh(); }}>Reset</Button>
        <span className="tnum ms-auto text-[12px] text-muted">Failures in a row: {breaker.consecutiveFailures}{state === "open" ? ` · retry in ${wait}s` : ""}</span>
      </div>
      <ul className="sys-log">{log.map((l) => <li key={l.id} data-tone={l.tone}>{l.text}</li>)}</ul>
    </Card>
  );
}

function LimiterDemo() {
  const [limiter] = useState(() => new RateLimiter({ capacity: 5, refillPerSec: 1 }));
  const [, setTick] = useState(0);
  const [stats, setStats] = useState({ ok: 0, refused: 0 });
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 200); return () => window.clearInterval(t); }, []);
  const burst = (n: number) => { let ok = 0; for (let i = 0; i < n; i++) if (limiter.tryTake()) ok++; setStats((s) => ({ ok: s.ok + ok, refused: s.refused + n - ok })); setTick((x) => x + 1); };
  const free = limiter.available;
  return (
    <Card title="🚦 Rate limiter, live" sub="A token bucket of 5, refilled at one token a second. Each request spends a token; with none left, it is refused.">
      <div className="sys-bucket" aria-label={`${free} of 5 tokens free`}>
        {Array.from({ length: 5 }, (_, i) => <span key={i} className={i < free ? "sys-token sys-token-on" : "sys-token"}>🪙</span>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => burst(1)}>Send 1 request</Button>
        <Button variant="secondary" size="sm" onClick={() => burst(8)}>Send a burst of 8</Button>
        <span className="tnum ms-auto text-[12px] text-muted">Allowed {stats.ok} · refused {stats.refused}</span>
      </div>
    </Card>
  );
}

function QueueDemo() {
  const [queue] = useState(() => new MessageQueue<string>({ capacity: 8 }));
  const [, setTick] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const refresh = () => setTick((x) => x + 1);
  const pings = ["🚗 trip finished", "📍 left zone", "⚡ charged", "🔧 checked in", "🧾 fine", "⛽ refuelled"];
  const publish = (n: number) => { for (let i = 0; i < n; i++) queue.publish("pings", pings[Math.floor(Math.random() * pings.length)]); refresh(); };
  const consume = () => { const m = queue.take("pings"); if (m) { queue.ack(m.id); setDone((d) => [`#${m.id} ${m.body}`, ...d].slice(0, 4)); } refresh(); };
  const depth = queue.depth("pings");
  return (
    <Card title="📬 Queue, live" sub="Holds up to 8 waiting messages. Publishing never blocks: past 8, the oldest is dropped and counted. A worker takes one, stores it, then acknowledges it.">
      <div className="sys-queue" aria-label={`${depth} messages waiting`}>
        {Array.from({ length: 8 }, (_, i) => <span key={i} className={i < depth ? "sys-slot sys-slot-on" : "sys-slot"} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => publish(1)}>📨 Publish a ping</Button>
        <Button variant="secondary" size="sm" onClick={() => publish(6)}>Publish 6</Button>
        <Button variant="secondary" size="sm" onClick={consume} disabled={!depth}>⚙️ Worker: take and ack</Button>
        <span className="tnum ms-auto text-[12px] text-muted">Waiting {depth} · dropped {queue.dropped}</span>
      </div>
      <ul className="sys-log">{done.map((d) => <li key={d} data-tone="good">✅ Stored {d}</li>)}</ul>
    </Card>
  );
}

/* ----------------------------------------------------------------------------------------------- page */
export default function SystemPage() {
  return (
    <>
      <PageHeader art="system" eyebrow="Architecture" title="System design, for a fleet that never stops">
        How a fleet platform stays fast and up when thousands of vehicles report at once: DNS, CDNs, load balancing, caching, rate limiting, databases,
        indexing, replication, sharding, CAP, microservices, circuit breakers, messages and queues. Each card says what it is, how a hosted fleet
        platform would use it, and honestly where FleetOps stands, since FleetOps runs in your browser with no servers of its own.
      </PageHeader>

      <SectionTitle sub="The hosted reference design. Packets show the paths a request and a telematics ping take; FleetOps today is the browser plus the CDN.">Reference design</SectionTitle>
      <Architecture />

      <SectionTitle sub="Fourteen building blocks. Green is in FleetOps now; amber is done the browser's way; grey belongs to a hosted version.">Building blocks</SectionTitle>
      <div className="sys-grid">
        {TOPICS.map((t) => (
          <article key={t.id} id={t.id} className="sys-topic">
            <header className="flex items-center gap-2.5">
              <span className="emoji-tile" aria-hidden="true">{t.emoji}</span>
              <h3 className="text-[15px] font-semibold">{t.title}</h3>
              <span className="sys-status ms-auto" data-status={t.status}>{STATUS_TEXT[t.status]}</span>
            </header>
            <p className="mt-2.5 text-[13px] leading-relaxed">{t.what}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted"><b className="text-text">🚚 At fleet scale: </b>{t.fleet}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted"><b className="text-text">💻 In FleetOps: </b>{t.today}</p>
          </article>
        ))}
      </div>

      <SectionTitle sub="Where the data lives decides the choice. Money and legal records want SQL and consistency; pings want a store built for time.">SQL vs NoSQL, CAP and sharding</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="🗃️ Which store for which fleet data">
          <table className="sys-table">
            <thead><tr><th>Data</th><th>Store</th><th>Why</th></tr></thead>
            <tbody>
              <tr><td>Job cards, ledger, handovers</td><td>SQL</td><td>Transactions, joins, audits</td></tr>
              <tr><td>Vehicles, documents, warranties</td><td>SQL</td><td>Fixed shape, unique VIN and plate</td></tr>
              <tr><td>GPS and CAN-bus pings</td><td>Time-series</td><td>Billions of rows, read by time window</td></tr>
              <tr><td>Inspection forms, photos</td><td>Document / object</td><td>Free-form, large files</td></tr>
              <tr><td>KPI tiles, sessions</td><td>Key-value cache</td><td>Read thousands of times a minute</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="🔺 CAP: choose per feature"><Cap /></Card>
        <Card title="🧩 Sharding trips by vehicle"><Shards /></Card>
      </div>

      <SectionTitle sub="These three run on the real classes in FleetOps' code (lib/resilience.ts); the circuit breaker and rate limiter are the ones that guard the VIN decoder.">Try it</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-3">
        <BreakerDemo />
        <LimiterDemo />
        <QueueDemo />
      </div>
    </>
  );
}
