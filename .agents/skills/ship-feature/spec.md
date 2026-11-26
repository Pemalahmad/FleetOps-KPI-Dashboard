# ship-feature: spec

## Goal

Take a finished change from a clean `main` to a merged pull request whose Pages deploy succeeded, following the
maintainer's standing rule for every feature.

## Outputs

- A feature branch with one or more plain commits authored by the maintainer.
- A `CHANGELOG.md` entry under `## Unreleased`, written for fleet owners.
- README text and counts that match the repository; for a user-visible feature, a README GIF recorded by
  `web/scripts/capture-gifs.mjs`.
- A pull request with a description of what changed and how it was checked, merged with a merge commit after CI passed.
- A successful `pages` workflow run on `main` for the merge commit, and the live site answering.

## Required actions

- Branch from a freshly fetched `origin/main`; fetch and rebase again before every push.
- Run the checklists of every role whose files the change touches (see `AGENTS.md`, "Agent roster").
- Run `npm --prefix web run ship-check` and fix every FAIL before pushing.
- Wait for every CI check on the pull request to pass before merging.
- Confirm the `pages` run for the merge commit concluded `success`.
- Log any friction with `npm --prefix web run papercut`.

## Forbidden actions

- Force-pushing, rewriting `main`, or retagging a release.
- Any `Co-Authored-By` line, tool credit or "generated with" text in commits, pull requests or files.
- Merging with a failing, pending or skipped required check.
- Committing secrets, the licence signing key, `.papercuts/` or real fleet data.
- Recording GIFs from anything other than the synthetic demo.
