#!/usr/bin/env node
/**
 * Self-host DuckDB-WASM: copy the exception-handling build (supported by every current browser)
 * from the installed package into public/duckdb/, so the dashboard never loads code from a CDN
 * and the engine version always matches the installed API.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const dest = join(root, "public", "duckdb");
mkdirSync(dest, { recursive: true });
for (const f of ["duckdb-eh.wasm", "duckdb-browser-eh.worker.js"]) {
  if (!existsSync(join(src, f))) {
    console.error(`DuckDB asset ${f} not found in ${src}. Did you run npm install?`);
    process.exit(1);
  }
  copyFileSync(join(src, f), join(dest, f));
}
console.log("DuckDB-WASM copied to public/duckdb/");
