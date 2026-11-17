/* FleetOps service worker: keeps the app usable offline.
 * - On install: caches the core app (pages, scripts, styles, SQL engine, demo fleet) listed in precache.json.
 * - The document reader (Tesseract + pdf.js, ~9 MB) is cached on first use, or all at once from the Plan page.
 * - Only same-origin GET requests are handled. Nothing is ever sent anywhere by this worker.
 *   (The one outside call the app can make, the optional NHTSA VIN decode, bypasses it and needs a connection.)
 */
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/FleetOps-KPI-Dashboard/" or "/"
let VERSION = "v0";

async function manifest() {
  const res = await fetch(`${SCOPE}precache.json`, { cache: "no-store" });
  return res.json();
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const m = await manifest();
    VERSION = m.version;
    const cache = await caches.open(`core-${m.version}`);
    // add in small batches so one slow file does not fail the whole install
    for (let i = 0; i < m.core.length; i += 20) await cache.addAll(m.core.slice(i, i + 20));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const m = await manifest().catch(() => null);
    if (m) {
      const keep = new Set([`core-${m.version}`, `ocr-${m.version}`, "runtime"]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "cache-ocr") {
    event.waitUntil((async () => {
      const m = await manifest();
      const cache = await caches.open(`ocr-${m.version}`);
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
        const res = await fetch(req);
        const c = await caches.open("runtime");
        c.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true }))
          ?? (await caches.match(url.pathname.replace(/\/?$/, "/"), { ignoreSearch: true }))
          ?? (await caches.match(SCOPE));
      }
    })());
    return;
  }
  // assets: hashed or versioned, so cache first
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: url.pathname.includes("__next") });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") (await caches.open("runtime")).put(req, res.clone());
    return res;
  })());
});
