// Logs a papercut: a small piece of friction an agent or a person hit while working in this repository, so the
// owner of that area can fix it. Appends one JSON line to .papercuts/log.jsonl (git-ignored, stays on this machine).
//   npm run papercut -- --area ship-feature --tried "..." --expected "..." --happened "..." --fix "..."
//   npm run papercut -- --summary        grouped by area, most reported first
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FIELDS = ["area", "tried", "expected", "happened", "suggested_fix"];
const FLAG = { area: "area", skill: "area", tried: "tried", expected: "expected", happened: "happened", fix: "suggested_fix", "suggested-fix": "suggested_fix" };

/** `--key value` and `--key=value` pairs, plus bare `--flag` switches set to true. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[m[1]] = argv[++i];
    else out[m[1]] = true;
  }
  return out;
}

/** Builds the log entry, or throws naming the missing fields. */
export function makeEntry(args, now = new Date()) {
  const e = { time: now.toISOString() };
  for (const [flag, field] of Object.entries(FLAG)) if (typeof args[flag] === "string" && args[flag].trim()) e[field] ??= args[flag].trim();
  const missing = FIELDS.filter((f) => !e[f]);
  if (missing.length) throw new Error(`missing ${missing.map((f) => `--${f === "suggested_fix" ? "fix" : f}`).join(", ")}`);
  return { time: e.time, area: e.area.toLowerCase(), tried: e.tried, expected: e.expected, happened: e.happened, suggested_fix: e.suggested_fix };
}

/** Groups JSONL text by area: [{ area, count, last, fixes }], most reported first. Bad lines are counted, not fatal. */
export function summarize(jsonl) {
  const groups = new Map();
  let bad = 0;
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { bad++; continue; }
    if (!e || typeof e.area !== "string") { bad++; continue; }
    const g = groups.get(e.area) ?? { area: e.area, count: 0, last: "", fixes: [] };
    g.count++;
    if ((e.time ?? "") > g.last) g.last = e.time ?? "";
    if (e.suggested_fix && !g.fixes.includes(e.suggested_fix)) g.fixes.push(e.suggested_fix);
    groups.set(e.area, g);
  }
  const areas = [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.area.localeCompare(b.area));
  return { areas, bad };
}

export function formatSummary({ areas, bad }) {
  if (!areas.length) return "No papercuts logged.";
  const lines = [];
  for (const a of areas) {
    lines.push(`${a.area}  ${a.count} report${a.count === 1 ? "" : "s"}, last ${a.last.slice(0, 10)}`);
    for (const f of a.fixes) lines.push(`  - ${f}`);
  }
  if (bad) lines.push(`(${bad} unreadable line${bad === 1 ? "" : "s"} skipped)`);
  return lines.join("\n");
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const file = join(root, ".papercuts", "log.jsonl");
  const args = parseArgs(process.argv.slice(2));
  if (args.summary) {
    console.log(formatSummary(summarize(existsSync(file) ? readFileSync(file, "utf8") : "")));
    return;
  }
  let entry;
  try { entry = makeEntry(args); } catch (err) {
    console.error(`papercut: ${err.message}\nusage: npm run papercut -- --area <skill or area> --tried "..." --expected "..." --happened "..." --fix "..."`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  console.log(`logged papercut for ${entry.area} in .papercuts/log.jsonl`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
