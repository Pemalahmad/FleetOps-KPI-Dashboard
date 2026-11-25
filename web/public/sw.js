/* FleetOps service worker: keeps the app usable offline.
 * - On install: caches the core app (pages, scripts, styles, SQL engine, demo fleet) listed in precache.json.
 * - The document reader (Tesseract + pdf.js, ~9 MB) is cached on first use, or all at once from the Plan page.
 * - Only same-origin GET requests are handled. Nothing is ever sent anywhere by this worker.
 *   (The one outside call the app can make, the optional NHTSA VIN decode, bypasses it and needs a connection.)
 */
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/FleetOps-KPI-Dashboard/" or "/"
const PREFIX = `fleetops:${encodeURIComponent(SCOPE)}:`;
const RUNTIME = `${PREFIX}runtime`;
const cacheName = (kind, version) => `${PREFIX}${kind}-${version}`;

async function cached(request, options) {
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX)) continue;
    const hit = await (await caches.open(name)).match(request, options);
    if (hit) return hit;
  }
}

async function manifest() {
  const res = await fetch(`${SCOPE}precache.json`, { cache: "no-store" });
  return res.json();
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const m = await manifest();
    const cache = await caches.open(cacheName("core", m.version));
    // add in small batches so one slow file does not fail the whole install
    for (let i = 0; i < m.core.length; i += 20) {
      await cache.addAll(m.core.slice(i, i + 20).map((path) => new Request(new URL(path, self.location.origin), { cache: "reload" })));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const m = await manifest().catch(() => null);
    if (m) {
      // Runtime assets can include unversioned files from the previous release.
      const keep = new Set([cacheName("core", m.version), cacheName("ocr", m.version)]);
      for (const k of await caches.keys()) if (k.startsWith(PREFIX) && !keep.has(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "cache-ocr") {
    event.waitUntil((async () => {
      const m = await manifest();
      const cache = await caches.open(cacheName("ocr", m.version));
      await cache.addAll(m.ocr);
      event.source?.postMessage({ type: "ocr-cached", files: m.ocr.length });
    })());
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.endsWith("/precache.json") || url.pathname.endsWith("/sw.js")) return;

  if (req.mode === "navigate") {
    // pages: fresh when online, cached when not
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        const c = await caches.open(RUNTIME);
        if (res.ok) await c.put(req, res.clone());
        return res;
      } catch {
        return (await cached(req, { ignoreSearch: true }))
          ?? (await cached(url.pathname.replace(/\/?$/, "/"), { ignoreSearch: true }))
          ?? (await cached(SCOPE))
          ?? new Response("FleetOps is unavailable offline. Reconnect and reload.", { status: 503 });
      }
    })());
    return;
  }
  // assets: hashed or versioned, so cache first
  event.respondWith((async () => {
    const hit = await cached(req, { ignoreSearch: url.pathname.includes("__next") });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") await (await caches.open(RUNTIME)).put(req, res.clone());
    return res;
  })());
});

