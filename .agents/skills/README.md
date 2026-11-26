# Agent skills

Each skill is a folder with a `SKILL.md` (frontmatter `name` and `description`, then numbered steps) and a `spec.md`
(goal, outputs, required and forbidden actions) written before the skill. Optional `scripts/` and `references/` files
are read only when a step points at them. Role briefs in [`..`](..) say who owns an area; skills say how to do one
repeated job in it.

| Skill | Use it when |
|---|---|
| [`ship-feature`](ship-feature/SKILL.md) | A feature or fix is ready to leave your machine |
| [`refresh-readme-gifs`](refresh-readme-gifs/SKILL.md) | A page shown in the README changed, or a new page needs its GIF |

`npm --prefix web run lint-skills` checks every skill, and CI runs it. A skill passes when:

- the frontmatter has `name` (the folder name) and a `description` of at most 400 characters that says "Use when";
- the body is at most 500 lines, and `spec.md` has Goal, Outputs, Required actions and Forbidden actions;
- `## Steps` holds `### 1.`, `### 2.` ... in order, each with one objective in its title, a command in a code block
  and a `Verify:` line;
- `## Error recovery` is a table of failure and fix, where no fix is just "try again";
- every relative link resolves.

Steps that a script can do deterministically belong in a script (`web/scripts/ship-check.mjs`), so the skill runs one
command and reads a short result.
