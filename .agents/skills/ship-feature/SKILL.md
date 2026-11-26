---
name: ship-feature
description: Ships a finished FleetOps change - feature branch, CHANGELOG entry, README text, counts and GIF, ship-check, pull request, green CI, merge and a confirmed Pages deploy. Use when a feature or fix is ready to leave your machine.
---

# Ship a feature

The maintainer's rule for every feature, as commands. Run them from the repository root. Read
[`AGENTS.md`](../../../AGENTS.md) first; release work (version bumps, tags) belongs to
[`release-manager`](../../release-manager.md), not this skill. The deterministic checks live in
`web/scripts/ship-check.mjs`: run it and read its one-line results instead of checking by eye.

## Steps

### 1. Start a branch from fresh main

```bash
git fetch origin && git switch -c <short-feature-name> origin/main
```

Verify: `git status -sb` prints `## <short-feature-name>...origin/main` and nothing else.

### 2. Run the role checklists for the files you touched

```bash
git diff --name-only origin/main
```

Match each path to its owner in the `AGENTS.md` roster and work through that brief's checklist (UI changes:
[`design-crafter`](../../design-crafter.md); anything in `web/src/lib/`, `web/scripts/` or `.github/`:
[`security-guardian`](../../security-guardian.md)).

Verify: every role whose files appear in the list has had its "Verify" or "Definition of done" items checked.

### 3. Write the CHANGELOG entry

Add a `### <Feature name>` heading with plain bullets under `## Unreleased` in `CHANGELOG.md`, written for fleet
owners.

```bash
npm --prefix web run ship-check -- --fast
```

Verify: the `changelog` line reads `PASS` and says CHANGELOG.md changed on this branch.

### 4. Update the README text and counts

Describe the feature where owners look for it (the "What it answers" table, the product tour or the docs table). If
SQL models, validation rules or data tests changed, regenerate the catalog first.

```bash
fleetkpi docs && npm --prefix web run ship-check -- --fast
```

Verify: `readme-counts` and `readme-files` read `PASS`.

### 5. Record the README GIF

For a user-visible feature, follow [`refresh-readme-gifs`](../refresh-readme-gifs/SKILL.md). Tooling, docs and
CI-only changes need no GIF.

```bash
npm --prefix web run build && npm --prefix web run gifs <scene>
```

Verify: `git status --short docs/` lists the new or changed `docs/web-*.gif` and `readme-gifs` reads `PASS`.

### 6. Run the full local gate

```bash
npm --prefix web run ship-check
```

Verify: the last line reads `0 failed`. Then run `npm --prefix web run test:e2e`; on macOS about 10 to 14 browser tests
fail regardless of the change, so compare against `main` and let CI decide those.

### 7. Commit as the maintainer

```bash
git add <files> && git commit -m "<what changed and why, in plain words>"
```

Verify: `git log -1 --format='%an <%ae>%n%b'` shows the maintainer and no trailer lines, and
`npm --prefix web run ship-check -- --fast` reads `PASS` for `no-attribution`.

### 8. Push the branch

```bash
git fetch origin && git rebase origin/main && git push -u origin HEAD
```

Verify: `git status -sb` shows the branch tracking `origin/<branch>` with no `ahead` count.

### 9. Open the pull request

Say what changed, why, how it was checked, and that no new network host or storage was added.

```bash
gh pr create --base main --title "<what changed>" --body-file <notes-file>
```

Verify: `gh pr view --json url,state` prints the URL and `"state":"OPEN"`.

### 10. Wait for CI

```bash
gh pr checks --watch --fail-fast
```

Verify: the command exits 0 and every check reads `pass`.

### 11. Merge with a merge commit

```bash
gh pr merge --merge --delete-branch
```

Verify: `gh pr view <number> --json state,mergeCommit` prints `"state":"MERGED"` and the merge SHA.

### 12. Confirm the Pages deploy

```bash
gh run list --workflow pages.yml --branch main --limit 1 --json databaseId,headSha,status,conclusion
```

Watch it with `gh run watch <databaseId> --exit-status` until it finishes.

Verify: `headSha` is the merge SHA, `conclusion` is `success`, and
`curl -sI https://pemalahmad.github.io/FleetOps-KPI-Dashboard/ | head -1` prints a `200` status line.

### 13. Log what slowed you down

Only when something cost you time or surprised you.

```bash
npm --prefix web run papercut -- --area ship-feature --tried "..." --expected "..." --happened "..." --fix "..."
```

Verify: `npm --prefix web run papercut -- --summary` lists the entry under `ship-feature`.

## Error recovery

| Failure | Fix |
|---|---|
| `changelog` FAIL: branch does not change CHANGELOG.md | Add the `### <Feature>` entry under `## Unreleased` (step 3) and commit it. |
| `readme-counts` FAIL | Run `fleetkpi docs`, then write the counts it prints in `docs/SQL_CATALOG.md` into every README mention. |
| `readme-files` FAIL | Fix the path in README, or add the missing file; a missing GIF means step 5 was skipped. |
| `readme-gifs` FAIL: no scene writes a GIF | Add a scene to `SCENES` in `web/scripts/capture-gifs.mjs` (see `refresh-readme-gifs`). |
| `agent-briefs` FAIL | Copy the edited brief: `cp .agents/<role>.md .claude/agents/`. |
| `no-attribution` FAIL, commits not pushed yet | `git reset --soft $(git merge-base origin/main HEAD)` and commit again with a clean message. |
| `no-attribution` FAIL, commits already pushed | Close the pull request, then ship the same diff from a new branch with clean commits; never force-push. |
| `git push` rejected (non-fast-forward) | `git fetch origin && git rebase origin/main`, resolve conflicts keeping the other agent's work, rerun step 6, push again without `--force`. |
| A CI job fails | `gh run view <run-id> --log-failed`, fix the cause locally, rerun step 6, commit, and push to the same branch. |
| Only the e2e job fails in CI | Download the `e2e-report` artifact (`gh run download <run-id> -n e2e-report`) and read the failing test's trace. |
| e2e fails because the demo preview is stale | `npm --prefix web run demo-preview`, commit `web/public/demo-preview.json`, push. |
| `pages` run fails after merge | `gh run view <run-id> --log-failed`; fix on a new branch and ship it with this skill. Never revert `main` by force. |
