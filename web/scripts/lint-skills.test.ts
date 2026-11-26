import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintSkill, RULES } from "./lint-skills.mjs";

const SPEC = "# demo: spec\n\n## Goal\nShip it.\n\n## Outputs\n- A PR.\n\n## Required actions\n- Run checks.\n\n## Forbidden actions\n- Force-push.\n";

const FM = "---\nname: demo-skill\ndescription: Ships a demo change. Use when a demo change is ready.\n---\n";
const STEP1 = "### 1. Start a branch\n\n```bash\ngit switch -c demo origin/main\n```\n\nVerify: `git status -sb` shows the branch.\n";
const STEP2 = "### 2. Run the checks\n\n```bash\nnpm run ship-check\n```\n\nVerify: the last line reads `0 failed`.\n";
const RECOVERY = "## Error recovery\n\n| Failure | Fix |\n|---|---|\n| Push rejected | `git fetch && git rebase origin/main`, then push. |\n";
const BODY = `# Demo\n\nSee [the notes](references/notes.md).\n\n## Steps\n\n${STEP1}\n${STEP2}\n${RECOVERY}`;

/** A skill that passes every rule; each failing fixture below changes exactly one thing. */
const skill = (over: { skill?: string; spec?: string | null; folder?: string } = {}) => {
  const files: Record<string, string> = { "SKILL.md": over.skill ?? FM + BODY, "references/notes.md": "Notes." };
  if (over.spec !== null) files["spec.md"] = over.spec ?? SPEC;
  return { folder: over.folder ?? "demo-skill", files };
};
const rules = (input: ReturnType<typeof skill>) => [...new Set(lintSkill(input).map((e: { rule: string }) => e.rule))];

describe("lintSkill golden cases", () => {
  it("passes a skill that follows every rule", () => {
    expect(lintSkill(skill())).toEqual([]);
  });

  const cases: [string, ReturnType<typeof skill>][] = [
    ["frontmatter", skill({ skill: BODY })],
    ["name-matches-folder", skill({ folder: "other-name" })],
    ["description-short", skill({ skill: FM.replace("Ships a demo change.", "Ships a demo change. ".repeat(25)) + BODY })],
    ["description-when", skill({ skill: FM.replace(" Use when a demo change is ready.", "") + BODY })],
    ["body-length", skill({ skill: FM + BODY + "\nfiller".repeat(500) })],
    ["spec", skill({ spec: null })],
    ["spec", skill({ spec: SPEC.replace("## Forbidden actions", "## Never") })],
    ["steps-numbered", skill({ skill: FM + BODY.replace("### 2. Run the checks", "### 3. Run the checks") })],
    ["steps-numbered", skill({ skill: FM + BODY.replace("## Steps", "## How") })],
    ["step-one-objective", skill({ skill: FM + BODY.replace("### 2. Run the checks", "### 2. Run the checks then push") })],
    ["step-one-objective", skill({ skill: FM + BODY.replace("### 2. Run the checks", "### 2. Run the checks; open the PR") })],
    ["step-command", skill({ skill: FM + BODY.replace("```bash\nnpm run ship-check\n```", "Run the ship checks.") })],
    ["step-verify", skill({ skill: FM + BODY.replace("Verify: the last line reads `0 failed`.", "The checks should pass.") })],
    ["error-recovery", skill({ skill: FM + BODY.replace(RECOVERY, "") })],
    ["error-recovery", skill({ skill: FM + BODY.replace("`git fetch && git rebase origin/main`, then push.", "Try again.") })],
    ["error-recovery", skill({ skill: FM + BODY.replace("| Push rejected | `git fetch && git rebase origin/main`, then push. |\n", "") })],
    ["links-resolve", skill({ skill: FM + BODY.replace("(references/notes.md)", "(references/missing.md)") })],
  ];
  it.each(cases)("fails only %s", (rule, input) => {
    expect(rules(input)).toEqual([rule]);
  });

  it("has a failing fixture for every rule", () => {
    expect(new Set(cases.map(([r]) => r))).toEqual(new Set(Object.keys(RULES)));
  });

  it("does not read commands or links inside code as steps or links", () => {
    const tricky = BODY.replace("```bash\nnpm run ship-check\n```", "```bash\n### 9. not a step\ncat [x](nowhere.md)\n```");
    expect(lintSkill(skill({ skill: FM + tricky }))).toEqual([]);
  });
});

describe("the repository's own skills", () => {
  const dir = join(import.meta.dirname, "..", "..", ".agents", "skills");
  const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it("exist", () => expect(folders.length).toBeGreaterThanOrEqual(2));
  it.each(folders)("%s passes the linter", (folder) => {
    const base = join(dir, folder);
    const files: Record<string, string> = {};
    for (const f of ["SKILL.md", "spec.md"]) if (existsSync(join(base, f))) files[f] = readFileSync(join(base, f), "utf8");
    expect(lintSkill({ folder, files, exists: (p: string) => existsSync(join(base, p)) })).toEqual([]);
  });
});
