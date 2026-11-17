# Security, reliability and operations review

Scope: the Python ingestion/SQL pipeline, browser imports, local persistence, document handling, rendering, exports, service worker, metric network, SOP experience and automation configuration. This is a source review with regression testing, not a penetration-test certification or a guarantee that every bug has been found.

## Corrected findings

| Area | Finding | Change |
|---|---|---|
| Document preview | Active HTML/SVG stored in a workspace could open under the application's origin | Reject active document formats; restrict previews to PDF, raster images and plain text; download legacy unsupported formats as binary |
| Chart rendering | Custom tooltip formatters interpolated imported labels into HTML | Render all chart tooltips on canvas and replace HTML formatter markup with plain text |
| Procedures | Markdown rendered unrestricted HTML and link schemes | Escape raw HTML, restrict links and avoid remote image loading |
| Exports | Calendar lines counted characters rather than UTF-8 octets; bare carriage returns could introduce properties | Fold by UTF-8 bytes, escape every newline variant, and test Arabic/emoji content |
| Spreadsheet safety | Leading whitespace could bypass formula-prefix protection | Neutralise whitespace-prefixed formula strings while retaining numeric types |
| Offline cache | Activation deleted unrelated caches on the same origin; failed responses could replace offline pages | Namespace caches by scope, restrict cleanup and reads, cache successful pages only, and provide an explicit offline fallback |
| Local persistence | Request success could be reported before the IndexedDB transaction committed | Resolve saves on transaction completion, close connections, and remove SOP notes with fleet data |
| Pipeline concurrency | Multiple browser builds could interleave on a shared warehouse | Serialise warehouse mutations; recover after failed tasks and engine initialisation; hide stale query results during rebuilds |
| Ingestion | An overflowing integer could abort an otherwise recoverable load | Convert out-of-range integer values to reportable NULLs |
| Export paths | Apostrophes in the destination path broke generated COPY SQL | Quote output paths as SQL literals |
| Metrics | Empty exposure yielded nonfinite values; scenarios allowed negative hours and unbounded percentages | Return missing values for absent exposure, bound physical inputs, preserve algebraic identities, flag infeasible availability and reset scenarios when scope changes |
| Statistics | Constant outcomes and zero-variance groups yielded undefined fit statistics | Report insufficient evidence instead of invalid statistics |

## Operating improvements

- Live SOP queue with evidence-based triggers, searchable procedures, owners, due dates, local checklists, notes and downloadable handoffs.
- Full purpose, exit criteria and escalation guidance remains visible. Manual completion never dismisses a live trigger.
- Metric search, keyboard selection, focused connections, scope/sample context and direct links to related procedures.
- Regional median aggregation is explicitly labelled as an approximation; regression links remain associations rather than causal claims.
- Revised light/dark visual system, keyboard skip navigation, selected navigation semantics and horizontally accessible mobile graph.
- Dependency audits run on pushes, pull requests and a weekly schedule; deploy builds include lint, types and tests.

## Validation and limits

Local verification includes Python pipeline/regression tests, TypeScript regression tests, lint and type checking. A static production build was checked with Webpack using Tailwind's compiler directly; the execution sandbox prevents Turbopack from binding its internal port. The normal Turbopack build remains configured for GitHub Actions.

The execution host cannot reach npm/PyPI audit endpoints. Dependency audit results must be confirmed in the dependency-security workflow; no clean dependency claim is made here. Docker, PowerShell launchers and a full Git history secret scan were not executed locally. Browser data is device-local and unencrypted at the application level. Shared profiles share access.

The review preserves the repository's incoming licence/version, documentation and sample-file changes.

## Upstream dependency finding

The first GitHub audit reported GHSA-fc5q-39xc-vjpf (CVE-2026-112366), a high-severity repeated-extglob denial of service in picomatch through 4.0.7. The advisory lists no patched version as of this review. The 16 npm findings are the affected package and its transitive development-tooling dependants, not 16 independent defects. The lockfile marks all affected picomatch copies as development dependencies.

Fleet file imports do not accept or evaluate glob patterns. Lint and test globs are repository-controlled. This limits the current exposure but does not remove the vulnerable dependency. The workflow runs production and full audits separately and deliberately keeps the full audit failing until an upstream fix or a verified replacement is available. Do not treat this review as a clean full-dependency audit.

Advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
