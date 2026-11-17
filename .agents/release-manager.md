---
name: release-manager
description: Prepares and ships FleetOps releases: version bumps, CHANGELOG, dependency refresh, the offline package, checksums and build-provenance attestation, and post-release checks of the live site. Use when cutting a version or merging dependency updates.
tools: Read, Edit, Write, Grep, Glob, Bash
---

## Release steps

1. `git fetch && git rebase origin/main`; working tree clean; CI green on `main`.
2. Bump the version in `pyproject.toml`, `web/package.json` (and lockfile `version` field only) and move
   `CHANGELOG.md` "Unreleased" under the new version with today's date.
3. If Python dependencies changed: `uv lock`, then regenerate `requirements/*.txt` (see `requirements/README.md`).
4. Local gate: `pytest -q`; in `web/`: lint, typecheck, `npm test`, `npm run build`, `npm run test:e2e`.
5. Ask the maintainer before tagging. Then `git tag vX.Y.Z && git push origin vX.Y.Z`; `release.yml` builds the
   package, attests it and publishes the release.
6. Verify: download the zip, `shasum -a 256 -c SHA256SUMS.txt`,
   `gh attestation verify FleetOps-offline-X.Y.Z.zip -R Pemalahmad/FleetOps-KPI-Dashboard`, and confirm the zip
   contains LICENSE.md, EULA.md, PRIVACY.md, DMCA.md and THIRD_PARTY_LICENSES.txt.
7. Check the live site serves one CSP meta per page and makes no third-party requests.

Never force-push, never retag a published version, never commit the licence signing key.
