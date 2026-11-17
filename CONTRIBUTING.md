# Contributing to FleetOps KPI

Thanks for helping. Bug reports, import problems and feature ideas are all welcome: open an
[issue](https://github.com/Pemalahmad/FleetOps-KPI-Dashboard/issues/new/choose) or start a
[discussion](https://github.com/Pemalahmad/FleetOps-KPI-Dashboard/discussions).

**Never attach a real fleet file, registration card or customer data to an issue.** Share column headers, a few
rows with the values changed, or one of the files in [`samples/`](samples).

## Set up

You need Python 3.10+ and Node 22.

```bash
git clone https://github.com/Pemalahmad/FleetOps-KPI-Dashboard.git
cd FleetOps-KPI-Dashboard
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
fleetkpi web-export --out web/public     # the SQL engine and demo fleet for the browser

cd web
npm ci
npm run dev                              # http://localhost:3000
```

## Before you open a pull request

Run what CI runs; a pull request can only merge into `main` when all of it passes.

```bash
pytest -q                                # Python: pipeline, rules, licence keys
cd web
npm run lint && npm run typecheck && npm test && npm run build
npx playwright install chromium          # once
npm run test:e2e                         # security tests against the build
```

- **SQL** lives in `fleetkpi/sql/`. It runs both in Python DuckDB and in DuckDB-WASM in the browser, so write it for
  both: give every computed column an explicit `AS` alias and avoid functions missing from older DuckDB versions.
- **New KPI?** Add the model, a validation rule or data test that proves it, and its entry in the metric network.
  Regenerate the catalog with `fleetkpi docs`.
- **New import format?** Add a test with a small synthetic file to `web/src/lib/` or `tests/`.
- **Privacy:** fleet data never leaves the browser. Do not add analytics, trackers, or calls to outside services;
  the Content Security Policy (written by `web/scripts/postbuild.mjs`) blocks them, and the e2e tests fail on any
  request to another site. Never add inline `<script>` tags by hand or `'unsafe-inline'` for scripts.
- Keep commits small, with a message saying what changed and why.

## Security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contribution is released under the project's licence,
[FSL-1.1-MIT](LICENSE.md).
