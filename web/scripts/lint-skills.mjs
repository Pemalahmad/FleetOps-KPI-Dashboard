// Checks every agent skill in .agents/skills/<name>/ against the house rules, pass or fail:
//   npm run lint-skills
// The rules (ids in brackets) are listed in RULES below and in .agents/skills/README.md. lint-skills.test.ts holds a
// passing fixture and one failing fixture per rule.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_BODY_LINES = 500;
export const MAX_DESCRIPTION_CHARS = 400;
export const MAX_STEP_TITLE_CHARS = 72;

export const RULES = {
  frontmatter: "SKILL.md starts with --- frontmatter holding `name` and `description`",
  "name-matches-folder": "`name` equals the skill's folder name",
  "description-short": `description is at most ${MAX_DESCRIPTION_CHARS} characters`,
  "description-when": "description says when to use the skill (\"Use when ...\")",
  "body-length": `body is at most ${MAX_BODY_LINES} lines`,
  spec: "spec.md sits next to SKILL.md with Goal, Outputs, Required actions and Forbidden actions sections",
  "steps-numbered": "a `## Steps` section holds `### 1. ...`, `### 2. ...` headings numbered from 1 without gaps",
  "step-one-objective": `each step title is one objective: no ';', no ' then ', at most ${MAX_STEP_TITLE_CHARS} characters`,
  "step-command": "each step gives a concrete command in a fenced code block",
  "step-verify": "each step has a `Verify:` line saying how to check its result before the next step",
  "error-recovery": "a `## Error recovery` table maps each failure to a fix, and no fix is just 'try again'",
  "links-resolve": "every relative link in SKILL.md points at a file that exists",
};

/** Splits `---\nkey: value\n---\nbody`. Values are single-line; quotes are stripped. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: text.slice(m[0].length) };
}

/** The text of a `## Heading` section up to the next `## ` heading (code blocks respected), or null. */
export function section(body, heading) {
  const lines = body.split(/\r?\n/);
  let inCode = false, start = -1;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^(```|~~~)/.test(l)) inCode = !inCode;
    if (!inCode && /^##\s/.test(l) && !/^###/.test(l)) {
      if (start >= 0) break;
      if (l.replace(/^##\s+/, "").trim().toLowerCase() === heading.toLowerCase()) { start = i; continue; }
    }
    if (start >= 0) out.push(l);
  }
  return start >= 0 ? out.join("\n") : null;
}

/** `### N. Title` steps inside the Steps section. */
export function parseSteps(stepsText) {
  const steps = [];
  let inCode = false, cur = null;
  for (const l of stepsText.split(/\r?\n/)) {
    if (/^(```|~~~)/.test(l)) inCode = !inCode;
    const h = !inCode && /^###\s+(?:(\d+)[.)]\s*)?(.*)$/.exec(l);
    if (h) { cur = { n: h[1] ? Number(h[1]) : null, title: h[2].trim(), body: [] }; steps.push(cur); continue; }
    if (cur) cur.body.push(l);
  }
  return steps.map((s) => ({ ...s, body: s.body.join("\n") }));
}

function tableRows(text) {
  const rows = text.split(/\r?\n/).filter((l) => /^\s*\|.*\|\s*$/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  return rows.filter((r) => !r.every((c) => /^:?-{3,}:?$/.test(c)));
}

const RETRY_ONLY = /^(just )?(try (it )?again|retry|re-?run( it)?|repeat( the step)?|run it again)\.?$/i;

/**
 * Lints one skill. `files` maps paths relative to the skill folder to their text; `exists(relPath)` answers for any
 * other path (links can climb out of the folder). Returns [{ rule, message }]; an empty list is a pass.
 */
export function lintSkill({ folder, files, exists = (p) => p in files }) {
  const errs = [];
  const fail = (rule, message) => errs.push({ rule, message });
  const text = files["SKILL.md"];
  if (text === undefined) return [{ rule: "frontmatter", message: "SKILL.md is missing" }];

  const { data, body } = parseFrontmatter(text);
  if (!data || !data.name || !data.description) fail("frontmatter", "frontmatter needs `name` and `description`");
  if (data?.name && data.name !== folder) fail("name-matches-folder", `name "${data.name}" is not the folder name "${folder}"`);
  const desc = data?.description ?? "";
  if (desc.length > MAX_DESCRIPTION_CHARS) fail("description-short", `description is ${desc.length} characters (max ${MAX_DESCRIPTION_CHARS})`);
  if (desc && !/\buse (it |this )?(when|before|after|for)\b/i.test(desc)) fail("description-when", "description should say \"Use when ...\"");

  const bodyLines = body.split(/\r?\n/).length;
  if (bodyLines > MAX_BODY_LINES) fail("body-length", `body is ${bodyLines} lines (max ${MAX_BODY_LINES}); move detail to references/`);

  const spec = files["spec.md"];
  if (spec === undefined) fail("spec", "spec.md is missing");
  else {
    const want = ["Goal", "Outputs", "Required actions", "Forbidden actions"];
    const missing = want.filter((h) => section(spec, h) === null);
    if (missing.length) fail("spec", `spec.md lacks ## ${missing.join(", ## ")}`);
  }

  const stepsText = section(body, "Steps");
  const steps = stepsText === null ? [] : parseSteps(stepsText);
  if (!steps.length) fail("steps-numbered", "no `## Steps` section with `### 1. ...` steps");
  steps.forEach((s, i) => {
    const label = `step ${s.n ?? `"${s.title}"`}`;
    if (s.n !== i + 1) fail("steps-numbered", `${label} should be numbered ${i + 1}`);
    if (/;/.test(s.title) || /\bthen\b/i.test(s.title) || s.title.length > MAX_STEP_TITLE_CHARS)
      fail("step-one-objective", `${label} title "${s.title}" holds more than one objective`);
    if (!/^(```|~~~)/m.test(s.body)) fail("step-command", `${label} has no command in a fenced code block`);
    if (!/^\s*(\*\*)?Verify:?(\*\*)?:?\s+\S/m.test(s.body)) fail("step-verify", `${label} has no "Verify:" line`);
  });

  const rec = section(body, "Error recovery");
  if (rec === null) fail("error-recovery", "no `## Error recovery` section");
  else {
    const rows = tableRows(rec);
    if (rows.length < 2 || rows[0].length < 2) fail("error-recovery", "Error recovery needs a table with a header and at least one failure → fix row");
    for (const r of rows.slice(1)) {
      const fix = r[r.length - 1].replace(/[*`_]/g, "").trim();
      if (!fix) fail("error-recovery", `failure "${r[0]}" has no fix`);
      else if (RETRY_ONLY.test(fix) || /^try again\b/i.test(fix)) fail("error-recovery", `failure "${r[0]}": "${fix}" is not a fix`);
    }
  }

  const noCode = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  for (const m of noCode.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1].replace(/[#?].*$/, "");
    if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) continue;
    if (!exists(t)) fail("links-resolve", `link "${m[1]}" points at nothing`);
  }
  return errs;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dir = join(root, ".agents", "skills");
  const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  if (!folders.length) { console.log("lint-skills: no skills in .agents/skills/"); process.exitCode = 1; return; }
  let failed = 0;
  for (const folder of folders) {
    const base = join(dir, folder);
    const files = {};
    for (const f of ["SKILL.md", "spec.md"]) if (existsSync(join(base, f))) files[f] = readFileSync(join(base, f), "utf8");
    const errs = lintSkill({ folder, files, exists: (p) => existsSync(join(base, p)) });
    if (!errs.length) { console.log(`PASS ${folder}`); continue; }
    failed++;
    console.log(`FAIL ${folder}`);
    for (const e of errs) console.log(`     [${e.rule}] ${e.message}`);
  }
  console.log(`${folders.length - failed} of ${folders.length} skills pass (${Object.keys(RULES).length} rules)`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
