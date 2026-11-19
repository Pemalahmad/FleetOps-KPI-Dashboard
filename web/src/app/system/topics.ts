/** The fourteen system-design building blocks, as they apply to a fleet platform, and where FleetOps stands today. */
export type TopicStatus = "live" | "partly" | "hosted";
export interface Topic { id: string; emoji: string; title: string; what: string; fleet: string; today: string; status: TopicStatus }

export const TOPICS: Topic[] = [
  {
    id: "dns", emoji: "🌐", title: "DNS", status: "partly",
    what: "The internet's phone book: turns a name like fleet.example.com into the address of a server, and can steer each visitor to the nearest region.",
    fleet: "One name per tenant or region (uae.fleet…, ksa.fleet…) with short time-to-live records, so a region can fail over in minutes; health-checked records drop a dead data centre automatically.",
    today: "GitHub's DNS serves pemalahmad.github.io. FleetOps has no servers of its own to point at: the app runs in your browser.",
  },
  {
    id: "lb", emoji: "⚖️", title: "Load balancing", status: "hosted",
    what: "Spreads incoming requests across several identical servers so none is overloaded, and stops sending traffic to a server that fails its health check.",
    fleet: "A layer-7 balancer in front of the API pods, round-robin for dashboards and sticky by vehicle for live telematics streams; drain a pod before deploying it.",
    today: "Not needed: every owner's browser is its own compute, so there is nothing to balance. A hosted version would add it.",
  },
  {
    id: "cdn", emoji: "🗺️", title: "CDNs", status: "live",
    what: "Copies of static files (the app, scripts, styles, images) kept on servers close to users, so pages load fast anywhere.",
    fleet: "Serve the app shell, the DuckDB engine and the demo data from edge caches in the Gulf; give every build file a content hash so it can be cached forever.",
    today: "GitHub Pages serves the whole app from its CDN, and every script is fingerprinted. Nothing else is fetched from any other host.",
  },
  {
    id: "cache", emoji: "⚡", title: "Caching", status: "live",
    what: "Keeping the answer to an expensive question close at hand, so the next time it is asked it comes back instantly. The hard part is knowing when the answer is stale.",
    fleet: "Redis in front of the reports API for KPI tiles (invalidated when a job card closes), HTTP caching for the app, and pre-computed monthly marts instead of recomputing from raw events.",
    today: "A service worker caches the app for offline use (Plan & offline), and the SQL warehouse keeps the built marts in memory so every chart is a quick read. Rebuilding on import is the invalidation.",
  },
  {
    id: "rate", emoji: "🚦", title: "Rate limiting", status: "live",
    what: "Caps how often a client may call a service (for example 100 requests a minute), protecting it from overload, abuse and runaway scripts.",
    fleet: "A token bucket per API key and per vehicle on the telematics ingest, with 429 answers and Retry-After headers; looser limits for dashboards, tighter for write endpoints.",
    today: "The VIN decoder (the one outside service FleetOps can call, only on your click) goes through a token bucket: a burst of 3 batches, then one every 1.5 seconds.",
  },
  {
    id: "sql", emoji: "🗃️", title: "SQL vs NoSQL", status: "partly",
    what: "SQL databases store tables with fixed columns, joins and transactions; NoSQL stores (documents, key-value, wide-column, time-series) trade some of that for scale and flexible shapes.",
    fleet: "SQL (Postgres) for job cards, the ledger, documents and anything with money or legal weight; a time-series store for GPS pings and CAN-bus signals; a document store for free-form inspection forms.",
    today: "Everything is SQL: DuckDB runs 64 tested models in your browser. Telematics arrive as exported files, so a time-series store is not needed yet.",
  },
  {
    id: "index", emoji: "🔎", title: "Indexing", status: "partly",
    what: "A sorted lookup structure (like a book's index) that lets the database find rows without reading the whole table, at the cost of slower writes and more storage.",
    fleet: "Unique indexes on VIN and plate, composite indexes on (vehicle_id, opened_at) for job history and (site_id, month) for dashboards; partial indexes on open jobs only.",
    today: "DuckDB scans columns with min/max zone maps per block, which is what analytical queries on a fleet need; the models join on keys tested for uniqueness.",
  },
  {
    id: "replication", emoji: "🪞", title: "Replication", status: "hosted",
    what: "Keeping copies of the same database on several machines: one primary takes writes, replicas serve reads and take over if the primary dies.",
    fleet: "Synchronous replica in a second availability zone for job cards and the ledger; asynchronous read replicas for dashboards and reports, which can lag a few seconds.",
    today: "Your data lives on your device. The offline download and the encrypted workspace export are your copies; there is no server-side replica.",
  },
  {
    id: "sharding", emoji: "🧩", title: "Sharding", status: "hosted",
    what: "Splitting one huge table across many databases by a key, so each holds a slice and they share the load.",
    fleet: "Shard trips and telematics pings by vehicle_id (hash), keep each tenant's job cards together by tenant_id, and keep small reference tables (sites, models) copied to every shard.",
    today: "Not needed: a fleet of tens of thousands of vehicles fits in one browser's warehouse. The demo runs 6,500 vehicles and 13 weeks of trips in seconds.",
  },
  {
    id: "cap", emoji: "🔺", title: "CAP theorem", status: "partly",
    what: "When the network splits, a distributed system must choose: stay consistent (refuse some requests) or stay available (answer, possibly with stale data). It cannot have both.",
    fleet: "Consistency for job cards, handovers and payments (never hand a car over twice); availability for dashboards and live maps, where a few seconds of staleness is fine.",
    today: "One copy, one device: always consistent, and available offline. The garage refuses to release a car with an open safety hold whatever the dashboards say.",
  },
  {
    id: "micro", emoji: "🧱", title: "Microservices", status: "hosted",
    what: "Building the system as small services that each own one job and their own data, deployed separately, instead of one large application.",
    fleet: "Separate services for telematics ingest, the garage and job cards, documents and OCR, billing, and notifications, talking through APIs and events; each scales on its own.",
    today: "One static app, organised as modules with clear owners (import, warehouse, garage, documents, licence). A hosted version would split along the same seams.",
  },
  {
    id: "breaker", emoji: "🔌", title: "Circuit breaker", status: "live",
    what: "Stops calling a service that keeps failing, waits, then lets one trial call through. It protects both sides and turns a stream of errors into one clear message.",
    fleet: "Around every outside dependency: the OEM warranty API, the traffic-fine portal, SMS and e-mail providers, map tiles; fall back to the last known answer while open.",
    today: "Around the VIN decoder: after 3 failed batches in a row it pauses for 30 seconds and tells you when to try again. Try the live breaker below.",
  },
  {
    id: "messages", emoji: "📨", title: "Messages", status: "partly",
    what: "Services tell each other that something happened (\"job closed\", \"vehicle left zone\") by publishing events, instead of calling each other directly and waiting.",
    fleet: "Events such as trip.finished, workorder.closed, fine.registered and document.expiring, published once and consumed by billing, alerts, KPIs and the customer app.",
    today: "The live feed is an event stream (trips, check-ins, handovers, charging, fines, alerts), and the activity log records each change you make as an event.",
  },
  {
    id: "queues", emoji: "📬", title: "Queues", status: "partly",
    what: "A buffer between a producer and a consumer: work waits in line, consumers take it at their own pace, and a message is only removed once it has been handled (acknowledged).",
    fleet: "Telematics pings land on a queue (Kafka or SQS) so a spike of 10,000 vehicles reporting at once never drops data; workers acknowledge each batch after it is stored.",
    today: "Document reading (OCR) runs in a background worker that takes pages one at a time, and the live feed keeps a bounded queue of the latest 40 events. Try the queue below.",
  },
];

export const STATUS_TEXT: Record<TopicStatus, string> = { live: "In FleetOps now", partly: "Partly, in the browser", hosted: "Hosted version only" };
