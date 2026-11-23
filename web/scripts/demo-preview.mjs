// Records the demo fleet's widget results into public/demo-preview.json (see src/lib/demo-preview.ts), so a first visit
// shows filled widgets while the SQL engine loads. Run after `npm run build`, and again whenever SQL models or the demo
// change (the e2e suite fails while the preview no longer matches the engine manifest):
//   npm run build && node scripts/demo-preview.mjs && npm run build
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4321, BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ["/", "/overview/", "/fleet/", "/drivers/", "/documents/", "/import/", "/plan/", "/network/", "/service/", "/customer/", "/workshop/",
  "/ledger/", "/licence/", "/pipeline/", "/system/", "/doctrine/"];

if (!existsSync(join(web, "out/index.html"))) throw new Error("Build first: npm run build");
const server = spawn(process.execPath, [join(web, "e2e/serve.mjs"), join(web, "out"), String(PORT)], { stdio: "ignore" });
try {
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE + "/");
  await page.getByText(/SQL models and \d+ tests ran/).waitFor({ timeout: 180_000 });
  for (const path of PAGES) {
    const link = page.locator(`aside a[href$="${path}"]`).first();
    if (await link.count()) await link.click(); else await page.goto(BASE + path);   // client-side: one engine, one recording
    await page.waitForTimeout(3000);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } });
    await page.waitForTimeout(2500);
  }
  const recorded = await page.evaluate(() => window.__fleetopsDemoPreview);
  await browser.close();
  if (!recorded?.log || !Object.keys(recorded.queries ?? {}).length) throw new Error("Nothing was recorded: is navigator.webdriver set?");
  const fingerprint = createHash("sha256").update(readFileSync(join(web, "public/engine/manifest.json"))).digest("hex");
  // Columns once, then rows of values: a third of the size of repeated row objects (about 1.5 MB gzipped).
  const columnar = Object.fromEntries(Object.entries(recorded.queries).map(([sql, rows]) => {
    const c = rows.length ? Object.keys(rows[0]) : [];
    return [sql, { c, r: rows.map((row) => c.map((k) => row[k] ?? null)) }];
  }));
  const json = JSON.stringify({ fingerprint, log: recorded.log, regions: recorded.regions ?? [], queries: columnar });
  for (const dir of ["public", "out"]) writeFileSync(join(web, dir, "demo-preview.json"), json);
  console.log(`demo-preview.json: ${Object.keys(recorded.queries).length} queries, ${(json.length / 1e6).toFixed(2)} MB, fingerprint ${fingerprint.slice(0, 12)}`);
} finally {
  server.kill();
}
