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

writeFileSync(join(out, "precache.json"), JSON.stringify({ version, core, ocr }));
writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify({
  name: "FleetOps KPI", short_name: "FleetOps",
  description: "Fleet register, documents and operations KPIs. Runs in your browser; your data stays on your device.",
  start_url: `${base}/fleet/`, scope: `${base}/`, display: "standalone",
  background_color: "#0d1821", theme_color: "#006b80",
  icons: [
    { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}, null, 1));
console.log(`Offline: ${core.length} core files, ${ocr.length} document-reader files, version ${version}`);

