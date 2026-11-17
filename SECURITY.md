# Security

## Reporting a vulnerability

Please report security issues privately: use **Security → Report a vulnerability** on this repository, or message the
maintainer through the LinkedIn profile linked in the README. Do not open a public issue. Reports are acknowledged
within a few days.

## Design

FleetOps has **no server and no accounts**. The app is static files; the SQL engine (DuckDB-WASM), the document
reader (Tesseract.js, pdf.js) and all data stay in the user's browser. That removes whole classes of risk (credential
theft, server-side injection, data breaches of a central store) and leaves the browser as the boundary to defend.

| Threat | Mitigation | Verified by |
|---|---|---|
| Script injection from imported files or scanned text (XSS) | React escapes all rendered values; user data never reaches `dangerouslySetInnerHTML` (used only for the bundled doctrine, SOPs and KaTeX formulas); charts draw text on canvas | Hostile workbook test: `<script>`, `<img onerror>` in headers and cells rendered as text, tripwire never fired |
| SQL injection through column names or values | Identifiers double-quote-escaped, literals single-quote-escaped, constants passed as literals; the one id used in a query is escaped | Hostile workbook test: id `X-001'); DROP TABLE vehicles; --` stored literally, all models ran |
| Data exfiltration by injected code | Content Security Policy: scripts, workers, WASM, fonts only from this site; the only allowed outside connection is NHTSA's VIN decoder | No CSP violations in normal use; network log shows same-origin requests only |
| Spreadsheet formula injection in exports | Cells starting with `= + - @` (or tab / CR) are prefixed with `'` | `exporters.test.ts` |
| Forged licence keys | Ed25519 signature checked offline; private key kept off the repository (`~/.config/fleetops/`, mode 600) | `license.test.ts`: edited and expired keys rejected |
| Tampered offline download | SHA-256 checksum published with every release | `SHA256SUMS.txt` |
| Offline server exposed to the network | Launchers bind to `127.0.0.1` / `localhost` only; the Windows server refuses paths outside the app folder | `offline/serve.ps1` |
| Vulnerable dependencies | `npm audit` and `pip-audit` clean at release; Dependabot and CodeQL run on the repository | `.github/` |
| Secrets in the repository | History scanned for keys and tokens; signing key never tracked | Release checklist |

## Scope notes

- The demo fleet is synthetic. Do not report its data as a leak.
- `'unsafe-inline'` is allowed for scripts and styles because a static Next.js export inlines its bootstrap; the
  `connect-src` and `worker-src` restrictions are what stop exfiltration.
- GitHub Pages cannot send custom headers, so the policy is delivered by `<meta>`; `frame-ancestors` (clickjacking)
  therefore cannot be enforced there. The app has no state-changing actions an attacker could trick a framed user into.
