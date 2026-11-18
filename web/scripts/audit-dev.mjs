// Audit of every dependency, development tooling included.
// Fails on any high or critical advisory that already has a fixed release; advisories with no fixed release anywhere
// (the newest published version is still affected) are listed but do not fail the build, since no update can clear
// them. Shipped (production) dependencies are audited separately with plain `npm audit --omit=dev`, which fails on
// everything.
import { execFileSync } from "node:child_process";

const npm = (args) => {
  try {
    return execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (e.stdout) return e.stdout; // npm audit exits non-zero when it finds anything
    throw e;
  }
};

const report = JSON.parse(npm(["audit", "--json"]));
const advisories = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;
    advisories.set(via.url, via);
  }
}

const json = (out) => (out.trim() ? JSON.parse(out) : null);
const blocking = [], waiting = [];
for (const a of advisories.values()) {
  const latest = json(npm(["view", a.name, "version", "--json"]));
  const affected = [json(npm(["view", `${a.name}@${a.range}`, "version", "--json"])) ?? []].flat();
  (affected.includes(latest) ? waiting : blocking).push({ ...a, latest });
}

for (const a of waiting) {
  console.log(`no fix yet  ${a.severity}  ${a.name}@${a.range} (newest ${a.latest} affected)  ${a.title}  ${a.url}`);
}
for (const a of blocking) {
  console.log(`FIX EXISTS  ${a.severity}  ${a.name}@${a.range} (newest ${a.latest})  ${a.title}  ${a.url}`);
}
if (blocking.length) {
  console.error(`\n${blocking.length} high/critical advisory(ies) have a fixed release: update the dependency.`);
  process.exit(1);
}
console.log(`\nOK: ${advisories.size} high/critical advisory(ies), none with a fixed release available.`);
