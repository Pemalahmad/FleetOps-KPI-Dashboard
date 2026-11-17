# Agents guide

Instructions for coding agents (and humans) working in this repository. Read this file first; the role files in
[`.agents/`](.agents/) give each specialist agent its own brief, checklist and definition of done.

## The product in one paragraph

FleetOps is fleet software that runs **entirely on the owner's device**: a static Next.js app (`web/`) with an
in-browser SQL warehouse (DuckDB-WASM), document reading (Tesseract.js, pdf.js) and a visual garage, plus a Python
package (`fleetkpi/`) that owns the SQL models, demo data and SOPs and exports them to the web app. There is no server,
no account and no telemetry. That is the security model, so protecting it is every agent's first job.

## Non-negotiable invariants (no back doors)

A change that breaks one of these is rejected, whatever it adds.

1. **No new network destination.** The app talks to its own origin and, only on the owner's click, to NHTSA's VIN
   decoder. Adding any other host, beacon, analytics, CDN, font or update check needs the maintainer's explicit approval
   *and* an update to the CSP in `web/scripts/postbuild.mjs`, `PRIVACY.md` and the e2e same-origin test.
2. **No hidden control.** No debug query parameters, hidden routes, master licence keys, environment-variable bypasses,
   remote configuration, kill switches or auto-update. Licence keys are verified only with the Ed25519 public key in
   `web/src/lib/license.ts`; never add an alternative path.
3. **No script execution from data.** No `eval`, `new Function`, inline event handlers or `'unsafe-inline'` scripts.
   HTML from text goes only through `web/src/lib/markdown.ts`. Every inline `<script>` is hashed into the CSP by
   postbuild; never render a CSP `<meta>` in `layout.tsx`.
4. **Owner data stays sealed.** Everything the owner enters is saved through `web/src/lib/workspace.ts`, which seals it
   with the vault key when a passphrase is set. Never write owner data to `localStorage`, cookies or a new store;
   never store the passphrase or key; never write plaintext over sealed data. Demo actions live in tab memory only.
5. **Safety gates cannot be bought.** Garage XP, missions and badges never waive an expired document, an open repair,
   an unknown evidence gap or a missing reviewer (`web/src/lib/garage.ts`).
6. **Supply chain stays pinned.** GitHub Actions by commit SHA; least-privilege `permissions` per job; `npm ci
   --ignore-scripts`; Python installs with `--require-hashes` from `requirements/*.txt`; DuckDB extensions checked
   against pinned SHA-256 hashes in `web/scripts/copy-assets.mjs`; Docker base image by digest.
7. **Secrets never enter the repository.** The licence signing key lives at `~/.config/fleetops/license_ed25519.pem`.

## Commands

| Task | Command |
|---|---|
| Python tests | `pytest -q` |
| Export engine + demo to the web app | `fleetkpi web-export --out web/public` |
| Web lint / types / unit + fuzz tests | `cd web && npm run lint && npm run typecheck && npm test` |
| Production build (writes the CSP) | `cd web && npm run build` |
| Security and garage end-to-end tests | `cd web && npm run test:e2e` |
| Offline package | `cd web && bash scripts/package-offline.sh <version>` |
| Refresh hash-locked Python requirements | see [`requirements/README.md`](requirements/README.md) |

A change is done only when lint, types, unit tests, the build and the e2e suite pass locally, and CI is green after
the push.

## Working rules

- **Several agents commit to this repository.** Always `git fetch` and rebase on `origin/main` before pushing; merge
  another agent's work instead of overwriting it; never force-push.
- Commit as the maintainer, with a plain descriptive message. No co-author or tool trailers.
- Keep the purple palette (`#6366f1` accent) and the existing light/dark tokens.
- Write user-facing text for fleet owners: plain words, no jargon, and never claim the app certifies a vehicle.
- If you change what is stored or sent, update `PRIVACY.md`; if you change licence terms or keys, update `EULA.md`;
  record user-visible changes in `CHANGELOG.md`.

## Agent roster

| Agent | Owns | Brief |
|---|---|---|
| Security guardian | The invariants above, CSP, vault, CI hardening, audits | [`.agents/security-guardian.md`](.agents/security-guardian.md) |
| Garage steward | Garage rules, recovery stages, handovers, missions and XP | [`.agents/garage-steward.md`](.agents/garage-steward.md) |
| Data intake | Spreadsheet import, column mapping, OCR, VIN decoding | [`.agents/data-intake.md`](.agents/data-intake.md) |
| Metrics analyst | SQL models, metric network maths, SOP triggers | [`.agents/metrics-analyst.md`](.agents/metrics-analyst.md) |
| Design crafter | Visual design, accessibility, mobile, motion | [`.agents/design-crafter.md`](.agents/design-crafter.md) |
| Release manager | Versions, changelog, offline package, provenance | [`.agents/release-manager.md`](.agents/release-manager.md) |
| Policy keeper | Privacy Policy, EULA, DMCA, licences, notices | [`.agents/policy-keeper.md`](.agents/policy-keeper.md) |

Route work by the files it touches. When a change crosses roles (for example a new import field that the garage
uses), the agent making it runs the other role's checklist too. The security guardian reviews every change to
`web/src/lib/`, `web/scripts/`, `.github/`, `Dockerfile` and `requirements/`.
