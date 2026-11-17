#!/usr/bin/env node
/** Copy the doctrine and SOPs (single source: the Python package) into public/content/. */
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "..", "fleetkpi");
const dest = join(root, "public", "content");
mkdirSync(dest, { recursive: true });
copyFileSync(join(pkg, "DOCTRINE.md"), join(dest, "DOCTRINE.md"));
const sops = readdirSync(join(pkg, "sops")).filter((f) => /^SOP-\d+.*\.md$/.test(f)).sort();
for (const f of sops) copyFileSync(join(pkg, "sops", f), join(dest, f));
writeFileSync(join(dest, "sops.json"), JSON.stringify(sops));
// Legal documents, shown on /legal/ (single source: the repository root)
for (const f of ["PRIVACY.md", "EULA.md", "DMCA.md"]) copyFileSync(join(root, "..", f), join(dest, f));
console.log(`Doctrine and ${sops.length} SOPs copied to public/content/`);
