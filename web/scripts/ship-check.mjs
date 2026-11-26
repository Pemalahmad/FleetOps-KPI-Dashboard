// Runs the deterministic checks a change must pass before it ships, and prints one line per check.
//   npm run ship-check            lint, types, unit tests, Python tests, build, then the repository checks
//   npm run ship-check -- --fast  repository checks only (under a second); CI runs this mode
//   npm run ship-check -- --gifs  which capture-gifs.mjs scene records which README GIF, and its size
// Exits 1 when any check fails. The pure functions below are covered by ship-check.test.ts.
import { readFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Lines under `## Unreleased` up to the next `## ` heading, or null when there is no such section. */
export function unreleasedEntries(changelog) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Unreleased\b/i.test(l));
  if (start < 0) return null;
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    if (/^\s*(-|\*|###)\s+\S/.test(l)) out.push(l.trim());
  }
  return out;
}

/** The changelog verdict: on a branch the entry must exist and CHANGELOG.md must be part of the change. */
export function changelogVerdict({ entries, ahead, changedFiles }) {
  if (entries === null) return { status: "FAIL", detail: "CHANGELOG.md has no '## Unreleased' section" };
  if (ahead === null) {
    return entries.length
      ? { status: "PASS", detail: `${entries.length} Unreleased lines (no origin/main to compare with)` }
      : { status: "SKIP", detail: "Unreleased is empty and there is no origin/main to compare with" };
  }
  if (ahead === 0) {
    return entries.length
      ? { status: "PASS", detail: `${entries.length} Unreleased lines` }
      : { status: "SKIP", detail: "nothing ahead of origin/main and Unreleased is empty" };
  }
  if (!entries.length) return { status: "FAIL", detail: "add an entry under '## Unreleased' in CHANGELOG.md" };
  if (!changedFiles.includes("CHANGELOG.md")) return { status: "FAIL", detail: "this branch does not change CHANGELOG.md" };
  return { status: "PASS", detail: `${entries.length} Unreleased lines, CHANGELOG.md changed on this branch` };
}

/** Local files a Markdown document points at: links, images and <img>/<source>/<video> src, outside code blocks. */
export function localRefs(markdown) {
  const text = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  const refs = new Set();
  const add = (raw) => {
    const t = raw.trim().replace(/^<|>$/g, "").split(/\s+/)[0].replace(/[#?].*$/, "");
    if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("//")) return;
    refs.add(decodeURIComponent(t.replace(/^\.\//, "")));
  };
  for (const m of text.matchAll(/\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g)) add(m[1]);
  for (const m of text.matchAll(/\b(?:src|poster|href)="([^"]+)"/g)) add(m[1]);
  return [...refs].sort();
}

const COUNT_LABELS = { "SQL models": "models", "validation rules": "validation", "data tests": "tests" };

/** Every "<n> SQL models / validation rules / data tests" claim in a text. */
export function countClaims(text) {
  return [...text.matchAll(/\*{0,2}(\d[\d,]*)\*{0,2}\s+(?:\*{0,2})(SQL models|models|validation rules|data tests)\b/g)].map((m) => ({
    key: COUNT_LABELS[m[2]] ?? "models",
    label: m[2],
    n: Number(m[1].replace(/,/g, "")),
  }));
}

/** Counts the SQL files under fleetkpi/sql/{models,validation,tests} from a list of tracked paths. */
export function countSql(paths) {
  const c = { models: 0, validation: 0, tests: 0 };
  for (const p of paths) {
    const m = /^fleetkpi\/sql\/(models|validation|tests)\/.+\.sql$/.exec(p);
    if (m) c[m[1]] += 1;
  }
  return c;
}

/** Claims that disagree with the actual counts, as readable messages. */
export function countMismatches(claims, actual, where) {
  return claims.filter((c) => c.n !== actual[c.key]).map((c) => `${where} says ${c.n} ${c.label}, fleetkpi/sql has ${actual[c.key]}`);
}

/** GIF names written by capture-gifs.mjs: record('web-garage', ...) -> docs/web-garage.gif. */
export function gifScenes(captureSource) {
  const scenes = {};
  for (const m of captureSource.matchAll(/^\s*([\w-]+):\s*\(\)\s*=>\s*record\(\s*['"]([\w-]+)['"]/gm)) scenes[`docs/${m[2]}.gif`] = m[1];
  return scenes;
}

/** Commit lines that credit a tool or a co-author. The maintainer is the only author of this repository. */
export function attributionLines(commits) {
  const bad = [/^co-authored-by:/i, /^generated (with|by)\b/i, /\bai[- ]generated\b/i, /\u{1F916}/u];
  const hits = [];
  for (const { sha, message } of commits) {
    for (const line of message.split(/\r?\n/)) {
      if (bad.some((re) => re.test(line.trim()))) hits.push(`${sha.slice(0, 7)}: ${line.trim()}`);
    }
  }
  return hits;
}

/** One aligned line per check, then the totals. */
export function formatReport(results) {
  const w = Math.max(...results.map((r) => r.name.length));
  const lines = results.map((r) => `${r.status.padEnd(4)} ${r.name.padEnd(w)}  ${r.detail}`);
  const n = (s) => results.filter((r) => r.status === s).length;
  lines.push(`${n("FAIL")} failed, ${n("PASS")} passed, ${n("SKIP")} skipped`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function tail(text, n = 15) {
  return text.trim().split("\n").slice(-n).map((l) => `       ${l}`).join("\n");
}

function runCommand(name, cmd, args, cwd) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status === 0) return { name, status: "PASS", detail: `${[cmd, ...args].join(" ")} (${secs} s)` };
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`;
  return { name, status: "FAIL", detail: `${[cmd, ...args].join(" ")} exited ${r.status ?? "with an error"}\n${tail(out)}` };
}

export function repoChecks(root) {
  const results = [];
  const base = git(root, ["rev-parse", "--verify", "-q", "origin/main"]) ? "origin/main" : null;
  const mergeBase = base ? git(root, ["merge-base", base, "HEAD"])?.trim() : null;
  const ahead = mergeBase ? Number(git(root, ["rev-list", "--count", `${mergeBase}..HEAD`]) ?? 0) : null;
  const changedFiles = mergeBase ? (git(root, ["diff", "--name-only", mergeBase]) ?? "").split("\n").filter(Boolean) : [];

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  results.push({ name: "changelog", ...changelogVerdict({ entries: unreleasedEntries(changelog), ahead, changedFiles }) });

  const readme = readFileSync(join(root, "README.md"), "utf8");
  const refs = localRefs(readme);
  const missing = refs.filter((r) => !existsSync(join(root, r)) || (statSync(join(root, r)).isFile() && statSync(join(root, r)).size === 0));
  results.push(missing.length
    ? { name: "readme-files", status: "FAIL", detail: `README points at missing or empty files: ${missing.join(", ")}` }
    : { name: "readme-files", status: "PASS", detail: `${refs.length} local links, images and videos exist` });

  const scenes = gifScenes(readFileSync(join(root, "web/scripts/capture-gifs.mjs"), "utf8"));
  const gifs = refs.filter((r) => /^docs\/web-[\w-]+\.gif$/.test(r));
  const orphan = gifs.filter((g) => !(g in scenes));
  results.push(orphan.length
    ? { name: "readme-gifs", status: "FAIL", detail: `no capture-gifs.mjs scene writes ${orphan.join(", ")}` }
    : { name: "readme-gifs", status: "PASS", detail: `${gifs.length} README GIFs, each recorded by a scene (${gifs.map((g) => scenes[g]).join(", ")})` });

  const tracked = (git(root, ["ls-files", "fleetkpi/sql"]) ?? "").split("\n");
  const actual = countSql(tracked);
  const catalogPath = join(root, "docs/SQL_CATALOG.md");
  const problems = [
    ...countMismatches(countClaims(readme), actual, "README"),
    ...(existsSync(catalogPath) ? countMismatches(countClaims(readFileSync(catalogPath, "utf8").split("\n").find((l) => l.includes("validation rules")) ?? ""), actual, "docs/SQL_CATALOG.md (run `fleetkpi docs`)") : []),
  ];
  results.push(problems.length
    ? { name: "readme-counts", status: "FAIL", detail: [...new Set(problems)].join("; ") }
    : { name: "readme-counts", status: "PASS", detail: `${actual.models} SQL models, ${actual.validation} validation rules, ${actual.tests} data tests match` });

  if (!mergeBase) {
    results.push({ name: "no-attribution", status: "SKIP", detail: "no origin/main to compare with (run `git fetch origin`)" });
  } else {
    const log = git(root, ["log", "--format=%H%x00%B%x1e", `${mergeBase}..HEAD`]) ?? "";
    const commits = log.split("\x1e").map((c) => c.trim()).filter(Boolean).map((c) => {
      const [sha, message = ""] = c.split("\x00");
      return { sha, message };
    });
    const hits = attributionLines(commits);
    results.push(hits.length
      ? { name: "no-attribution", status: "FAIL", detail: `remove these lines (git commit --amend or a new branch): ${hits.join(" | ")}` }
      : { name: "no-attribution", status: "PASS", detail: `${commits.length} commit${commits.length === 1 ? "" : "s"} ahead of origin/main, no co-author or tool lines` });
  }
  return results;
}

function main() {
  const fast = process.argv.includes("--fast");
  const web = join(dirname(fileURLToPath(import.meta.url)), "..");
  const root = resolve(web, "..");
  if (process.argv.includes("--gifs")) {
    const readmeRefs = localRefs(readFileSync(join(root, "README.md"), "utf8"));
    const scenes = gifScenes(readFileSync(join(web, "scripts/capture-gifs.mjs"), "utf8"));
    console.log("scene            gif                              MB   in README");
    for (const [gif, scene] of Object.entries(scenes)) {
      const mb = existsSync(join(root, gif)) ? (statSync(join(root, gif)).size / 1e6).toFixed(1) : "-";
      console.log(`${scene.padEnd(16)} ${gif.padEnd(32)} ${mb.padStart(4)}   ${readmeRefs.includes(gif) ? "yes" : "no"}`);
    }
    return;
  }
  const results = [];
  if (fast) {
    results.push({ name: "commands", status: "SKIP", detail: "--fast: lint, types, unit tests, pytest and build not run" });
  } else {
    results.push(runCommand("lint", "npm", ["run", "-s", "lint"], web));
    results.push(runCommand("typecheck", "npm", ["run", "-s", "typecheck"], web));
    results.push(runCommand("unit-tests", "npm", ["test", "-s"], web));
    const py = [join(root, ".venv/bin/python"), "python3"].find((p) => spawnSync(p, ["-c", "import pytest"]).status === 0);
    results.push(py ? runCommand("pytest", py.startsWith(root) ? relative(root, py) : py, ["-m", "pytest", "-q"], root) : { name: "pytest", status: "SKIP", detail: "no Python with pytest found" });
    results.push(runCommand("build", "npm", ["run", "-s", "build"], web));
  }
  results.push(...repoChecks(root));
  console.log(`ship-check${fast ? " --fast" : ""}`);
  console.log(formatReport(results));
  process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
