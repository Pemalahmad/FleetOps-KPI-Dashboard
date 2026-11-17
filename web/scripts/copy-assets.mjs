#!/usr/bin/env node
/**
 * Self-host every heavy browser asset, copied from the installed packages at build time so versions always
 * match the APIs in use and nothing loads from a CDN at runtime:
 *   public/duckdb/     DuckDB-WASM (exception-handling build, supported by every current browser)
 *   public/tesseract/  Tesseract.js worker, LSTM cores, English + Arabic models (registration cards)
 *   public/pdf/        pdf.js worker (PDF policies and cards)
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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
