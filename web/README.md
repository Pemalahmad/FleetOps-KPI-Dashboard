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
| `src/lib/engine.ts` | Runs the exported pipeline in DuckDB-WASM: ingest with column synonyms, settings, macros, 34 rules, 56 models, 22 tests |
| `src/lib/stats.ts` | OLS, multiple OLS, logistic regression (damped IRLS), risk ratio, Welch t, LMDI decomposition, distributions |
| `src/lib/metrics.ts` | The metric network: nodes, identities, regression models, aggregation, what-if propagation |
| `src/app/` | One folder per page |
| `src/components/` | Engine provider, chart wrapper, shell, UI kit |
| `scripts/` | Build-time copies: DuckDB-WASM assets, doctrine and SOPs |
