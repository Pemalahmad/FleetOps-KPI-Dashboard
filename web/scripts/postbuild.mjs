#!/usr/bin/env node
/**
 * After `next build`: write out/precache.json (what the service worker keeps offline) and the web app manifest,
 * both under the site's base path (GitHub Pages serves the app from /<repo>/, the offline package from /).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(fileURLToPath(new URL("..", import.meta.url)), "out");
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// everything the site serves, except source maps and the two control files the worker fetches itself
const files = walk(out).map((p) => relative(out, p).split("\\").join("/"))
  .filter((f) => !f.endsWith(".map") && f !== "precache.json" && f !== "sw.js");
const url = (f) => `${base}/${f.endsWith("index.html") ? f.slice(0, -"index.html".length) : f}`;
const isOcr = (f) => f.startsWith("tesseract/") || f.startsWith("pdf/");
const core = files.filter((f) => !isOcr(f)).map(url);
const ocr = files.filter(isOcr).map(url);

const hash = createHash("sha256");
for (const f of files.sort()) hash.update(f).update(readFileSync(join(out, f)));
const version = hash.digest("hex").slice(0, 12);

// Content Security Policy, written into every page as the first element of <head>. Scripts: this site plus the SHA-256
// of each inline bootstrap script on that page, so any script injected later is refused. Workers, WASM, fonts and
// data come from this site only; the one outside connection allowed is NHTSA's VIN decoder, used only when the owner
// clicks "Decode". Even injected code could not send fleet data anywhere else.
const policy = (hashes) => [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(" ")} 'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://vpic.nhtsa.dot.gov",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'self' blob:",
].join("; ");

const pages = files.filter((x) => x.endsWith(".html"));
let hashed = 0;
for (const f of pages) {
  const p = join(out, f);
  const html = readFileSync(p, "utf8");
  if (html.includes("Content-Security-Policy")) throw new Error(`postbuild: ${f} already has a policy; it must come from here only`);
  const hashes = new Set();
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc=/.test(m[1] ?? "") || !m[2]) continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy([...hashes]).replace(/'/g, "&#x27;")}"/>`;
  const head = html.indexOf("<head>");
  if (head < 0) throw new Error(`postbuild: no <head> in ${f}`);
  writeFileSync(p, html.slice(0, head + 6) + meta + html.slice(head + 6));
  hashed += hashes.size;
}
console.log(`CSP: written into ${pages.length} pages, ${hashed} inline scripts pinned by SHA-256, no 'unsafe-inline' for scripts`);

writeFileSync(join(out, "precache.json"), JSON.stringify({ version, core, ocr }));
writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify({
  name: "FleetOps KPI", short_name: "FleetOps",
  description: "Fleet register, documents and operations KPIs. Runs in your browser; your data stays on your device.",
  start_url: `${base}/fleet/`, scope: `${base}/`, display: "standalone",
  background_color: "#0a0c14", theme_color: "#6366f1",
  icons: [
    { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}, null, 1));
console.log(`Offline: ${core.length} core files, ${ocr.length} document-reader files, version ${version}`);

