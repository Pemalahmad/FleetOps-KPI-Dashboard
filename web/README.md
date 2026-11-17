# web/: the FleetOps KPI dashboard

Next.js (static export) + TypeScript + Tailwind + ECharts + KaTeX, with the SQL pipeline running in the browser on DuckDB-WASM.

```bash
# from the repository root: export the SQL engine and demo fleet from the Python package
pip install -e . && fleetkpi web-export --out web/public

cd web
npm install
npm run dev        # http://localhost:3000
npm test           # statistics and metric-network tests (Vitest)
npm run build      # static site in out/ (set NEXT_PUBLIC_BASE_PATH for a sub-path)
```

| Path | What it is |
|---|---|
| `src/lib/engine.ts` | Runs the exported pipeline in DuckDB-WASM: ingest with the owner's mappings, registry or operations mode, settings, macros, 41 rules, 59 models, 24 tests |
| `src/lib/sheets.ts` | Reads Excel / CSV / Parquet / JSON, finds header rows, recognises tables and maps columns |
| `src/lib/docscan.ts` | Reads registration cards and policies (Tesseract.js OCR in English and Arabic, pdf.js) and extracts vehicle, type, dates, issuer |
| `src/lib/vin.ts` | VIN format, check digit, model year; optional NHTSA vPIC decode |
| `src/lib/workspace.ts` | The owner's fleet in IndexedDB: sheets, mappings, documents and their files, VIN decodes |
| `src/lib/stats.ts` | OLS, multiple OLS, logistic regression (damped IRLS), risk ratio, Welch t, LMDI decomposition, distributions |
| `src/lib/metrics.ts` | The metric network: nodes, identities, regression models, aggregation, what-if propagation |
| `src/app/` | One folder per page |
| `src/components/` | Engine provider, chart wrapper, shell, UI kit |
| `scripts/` | Build-time copies of self-hosted assets (DuckDB-WASM, Tesseract, pdf.js), the doctrine and SOPs |
