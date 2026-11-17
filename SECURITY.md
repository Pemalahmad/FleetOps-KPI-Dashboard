# Security

## Reporting a vulnerability

Report security issues privately with **Security → Report a vulnerability** on this repository (private
vulnerability reporting is enabled), or message the maintainer through the LinkedIn profile linked in the README.
Please do not open a public issue. Reports are acknowledged within a few days.

## Design

FleetOps has **no server and no accounts**. The app is static files; the SQL engine (DuckDB-WASM), the document
reader (Tesseract.js, pdf.js) and all data stay in the user's browser. That removes whole classes of risk (credential
theft, server-side injection, breaches of a central store) and leaves the browser, the device and the build pipeline
as the things to defend.

## Threats and controls

Every control marked *CI* is checked on every commit by the end-to-end security tests in
[`web/e2e/security.e2e.ts`](web/e2e/security.e2e.ts), which run the production build in a real browser.

| Threat | Control | Verified by |
|---|---|---|
| Script injection (XSS) from imported files or scanned text | React escapes all rendered values; procedure Markdown escapes raw HTML and restricts link schemes; KaTeX runs in its untrusted mode; chart labels and tooltips draw text on canvas. **Strict Content Security Policy:** no `'unsafe-inline'` for scripts; each page allows only its own bootstrap scripts, pinned by SHA-256 at build time | *CI*: a hostile workbook (`<script>`, `<img onerror>`, `<svg onload>` in headers and cells) renders as text; a script injected into the page is refused |
| SQL injection through column names or values | Identifiers double-quote-escaped, literals single-quote-escaped, constants passed as literals | *CI*: id `X-001'); DROP TABLE vehicles; --` is stored literally and the table survives |
| Data exfiltration by injected code | CSP `connect-src` allows this site and NHTSA's VIN decoder only. The database engine runs in a **blob worker**, which inherits the page's policy (a URL-loaded worker would get none on GitHub Pages) | *CI*: every request from every page, worker included, goes to the app's own origin |
| Code loaded from third parties at runtime | Everything is self-hosted, including DuckDB's parquet and json extensions, which are downloaded at build time, **checked against pinned SHA-256 hashes**, and served from this site | *CI*: same-origin check above; the build fails on a hash mismatch |
| Executable document uploads | Scanning accepts PDF, raster images and plain text; HTML and SVG are rejected, and legacy active content downloads without an executable same-origin preview | `docscan.test.ts` |
| Someone else using the same computer | **Optional passphrase:** every stored sheet, document and scan is sealed with AES-256-GCM; key from PBKDF2-SHA-256 with 600,000 iterations and a random salt; key kept only in the tab's memory; passphrase never stored | *CI*: stored data contains no plate, VIN or name; a wrong passphrase is refused; a reload locks again. Unit tests: tamper detection, fresh IVs |
| Lost or interleaved local writes | IndexedDB saves resolve only at transaction commit; warehouse builds are serialised; protecting and unprotecting write in an order that never leaves data sealed without its key header | `task-queue.test.ts`, storage transaction handlers |
| Other apps sharing a hosting origin | Service-worker caches are namespaced by application scope; cache cleanup never deletes another app's caches | `service-worker.test.ts` |
| Spreadsheet formula injection in exports | Text cells with a formula prefix (`= + - @`, also after whitespace) or a leading tab / CR / LF are prefixed with `'` | `exporters.test.ts` |
| Forged licence keys | Ed25519 signature checked offline; private key kept off the repository (`~/.config/fleetops/`, mode 600) | `license.test.ts` |
| Tampered offline download | SHA-256 checksum and a **signed build-provenance attestation** (Sigstore) with every release | `gh attestation verify FleetOps-offline-<version>.zip -R Pemalahmad/FleetOps-KPI-Dashboard` |
| Offline server exposed to the network | Launchers bind to `127.0.0.1` / `localhost` only; the Windows server refuses paths outside the app folder | `offline/serve.ps1` |
| Compromised build pipeline | GitHub Actions pinned to commit SHAs; workflows read-only by default; checkouts without stored credentials; `npm ci --ignore-scripts`; branch rules: no force-push or deletion of `main`, pull requests must pass CI | [OpenSSF Scorecard](https://securityscorecards.dev/viewer/?uri=github.com/Pemalahmad/FleetOps-KPI-Dashboard), weekly |
| Vulnerable dependencies | npm audit (high/critical gate) and pip-audit on pushes, pull requests and weekly; Dependabot alerts and automatic security-fix pull requests; CodeQL on every push | `.github/workflows/security-audit.yml` |
| Secrets committed by mistake | GitHub secret scanning with **push protection** (a push containing a key is blocked); history scanned; signing key never tracked | Security tab |

## Scope notes

- The demo fleet is synthetic. Do not report its data as a leak.
- `'unsafe-inline'` remains for **styles** only (charts and the maths renderer set inline styles). Styles cannot run
  code or send data under this policy.
- `'wasm-unsafe-eval'` lets the browser compile the WebAssembly engines (DuckDB, Tesseract); it does not allow
  JavaScript `eval`.
- The CSP is defence in depth, not a guarantee: same-origin requests and the optional VIN endpoint remain allowed.
- GitHub Pages cannot send custom headers, so the policy is delivered by `<meta>`; `frame-ancestors` (clickjacking)
  therefore cannot be enforced there. Deployments that need clickjacking protection must send `frame-ancestors` as an
  HTTP response header from a host that supports it.

## Verification boundaries

Automated checks and source review reduce risk; they do not prove the absence of vulnerabilities or bugs. Audit
results are time-dependent: check the latest dependency-security and CodeQL runs before a release.

Without a passphrase, fleet inputs and documents are stored on the device unencrypted; treat a shared browser profile
as shared access. **With** a passphrase, sheets, documents and scans are encrypted, but SOP review notes (kept in the
browser's local storage) are not yet covered. Passphrase protection guards data at rest: while the fleet is unlocked in
a tab, anyone using that tab can see it; close or reload the tab to lock it. A forgotten passphrase cannot be recovered,
by design. "Delete my fleet data" removes everything, including SOP notes; exported reviews must be managed separately.

## Current upstream finding (2026-11-17)

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 affects `picomatch` (≤ 4.0.7, slow regular expression) in the development
tooling (linter and test runner). It never ships in the app, and imported fleet files are not interpreted as glob
patterns. No patched version is listed upstream; the full dependency audit fails intentionally until one is, while
production dependencies are audited separately. See
[review details](docs/SECURITY_REVIEW_2026-11-17.md#upstream-dependency-finding).
