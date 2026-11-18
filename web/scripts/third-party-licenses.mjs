#!/usr/bin/env node
/**
 * Write the licence text of every production dependency that ships in the app (not build or test tooling), as
 * required by MIT, BSD and Apache-2.0 (which also asks for NOTICE files). Usage: node scripts/third-party-licenses.mjs <out.txt>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const out = process.argv[2] ?? join(root, "THIRD_PARTY_LICENSES.txt");
const parts = ["Third-party software included in FleetOps", "=".repeat(41), "",
  "FleetOps itself: FSL-1.1-MIT (LICENSE.md). The components below keep their own licences.", ""];
let n = 0;
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/") || meta.dev || meta.devOptional) continue;
  const dir = join(root, path);
  if (!existsSync(dir)) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(f)).sort();
  parts.push("-".repeat(78), `${name} ${meta.version ?? ""} (${meta.license ?? "see below"})`, "-".repeat(78));
  for (const f of files) parts.push(readFileSync(join(dir, f), "utf8").trim(), "");
  if (!files.length) parts.push(`Licence: ${meta.license ?? "unknown"} (no licence file in the package)`, "");
  n++;
}
// Components copied into the source tree rather than installed from npm.
const bits = join(root, "src/components/bits/LICENSE.md");
if (existsSync(bits)) {
  parts.push("-".repeat(78), "React Bits components: DotGrid, SpotlightCard, ClickSpark, ShinyText, GlareHover, LogoLoop, Magnet (MIT + Commons Clause)", "-".repeat(78), readFileSync(bits, "utf8").trim(), "");
  n++;
}
writeFileSync(out, parts.join("\n"));
console.log(`${n} production packages -> ${out}`);
