#!/usr/bin/env node
/**
 * Self-host every heavy browser asset, copied from the installed packages at build time so versions always
 * match the APIs in use and nothing loads from a CDN at runtime:
 *   public/duckdb/     DuckDB-WASM (exception-handling build, supported by every current browser)
 *   public/tesseract/  Tesseract.js worker, LSTM cores, English + Arabic models (registration cards)
 *   public/pdf/        pdf.js worker (PDF policies and cards)
 *   public/duckdb/extensions/  DuckDB's parquet and json extensions, which DuckDB-WASM would otherwise download from
 *                      extensions.duckdb.org at runtime. Fetched once at build time and checked against pinned SHA-256
 *                      hashes; the engine is pointed at this copy (engine.ts) so the app never contacts DuckDB's servers.
 *                      When @duckdb/duckdb-wasm is upgraded, update DUCKDB_VERSION and the hashes (the e2e tests fail
 *                      if the engine reaches for anything that is not here).
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const pub = join(root, "public");

const copies = [
  ["@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", "duckdb/duckdb-eh.wasm"],
  ["@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js", "duckdb/duckdb-browser-eh.worker.js"],
  ["tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract/core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract/core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract/lang/eng.traineddata.gz"],
  ["@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz", "tesseract/lang/ara.traineddata.gz"],
  ["pdfjs-dist/build/pdf.worker.min.mjs", "pdf/pdf.worker.min.mjs"],
];

for (const [from, to] of copies) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.error(`Asset ${from} not found. Did you run npm install?`);
    process.exit(1);
  }
  mkdirSync(dirname(join(pub, to)), { recursive: true });
  copyFileSync(src, join(pub, to));
}
console.log(`Copied ${copies.length} self-hosted assets into public/ (DuckDB, Tesseract, pdf.js)`);

const DUCKDB_VERSION = "v1.5.4";
const EXTENSIONS = {
  parquet: "4845705bbd69fc9ad52878d96a505c73cae4a6c509822079cc2413e5eb437f95",
  json: "993b19f7929cc305b2529c548f2842e8e7a5b112d1c88f31c84798b51901ca16",
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
for (const [name, want] of Object.entries(EXTENSIONS)) {
  const file = `${name}.duckdb_extension.wasm`;
  const dest = join(pub, "duckdb/extensions", DUCKDB_VERSION, "wasm_eh", file);
  if (existsSync(dest) && sha256(readFileSync(dest)) === want) continue;
  const res = await fetch(`https://extensions.duckdb.org/${DUCKDB_VERSION}/wasm_eh/${file}`);
  if (!res.ok) { console.error(`Could not download the DuckDB ${name} extension: HTTP ${res.status}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== want) { console.error(`DuckDB ${name} extension failed its SHA-256 check; refusing to ship it.`); process.exit(1); }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}
console.log(`DuckDB extensions verified (${Object.keys(EXTENSIONS).join(", ")}, ${DUCKDB_VERSION}) and self-hosted`);
