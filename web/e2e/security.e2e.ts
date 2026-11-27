/**
 * Security end-to-end tests, run against the production build in a real browser on every CI run.
 *
 *  1. Every page loads under the strict Content Security Policy with no violations and no errors.
 *  2. A script injected into the page is refused (no 'unsafe-inline').
 *  3. A hostile workbook (XSS in headers and cells, SQL injection in an id, spreadsheet formulas) is shown as text,
 *     runs nothing and breaks no SQL.
 *  4. The page talks to its own origin only.
 *  5. Another site framing the app gets a hidden page (clickjacking guard; Pages cannot send frame-ancestors).
 *  6. Passphrase protection: the stored fleet and procedure notes contain no readable data, a wrong passphrase is refused, the right one
 *     opens it, and removing protection restores it.
 */
import { expect, test, type Page } from "@playwright/test";
import { createServer } from "node:http";
import path from "node:path";
import * as XLSX from "xlsx";

const PAGES = ["/", "/overview/", "/fleet/", "/drivers/", "/documents/", "/import/", "/plan/", "/network/", "/dispatch/", "/service/", "/customer/", "/workshop/", "/ledger/",
  "/licence/", "/pipeline/", "/system/", "/doctrine/", "/ehs/", "/team-cases/", "/legal/"];
const SAMPLE = path.resolve(__dirname, "../../samples/fleet-vehicles.xlsx");

/** Collect CSP violations, page errors and every request's origin. */
async function watch(page: Page) {
  const seen = { violations: [] as string[], errors: [] as string[], origins: new Set<string>() };
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  page.on("pageerror", (e) => seen.errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) seen.violations.push(m.text()); });
  page.on("request", (r) => { if (/^https?:/.test(r.url())) seen.origins.add(new URL(r.url()).origin); });
  return seen;
}

const cspViolations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
const ready = (page: Page) => expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });

async function importWorkbook(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/import/");
  await ready(page);
  await page.setInputFiles("input[type=file]", file);
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
}

test.beforeEach(async ({ page }) => {
  // each test starts from an empty browser profile; make sure no fleet data is left over
  await page.goto("/");
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("fleetops-workspace"); q.onsuccess = q.onerror = q.onblocked = r; }));
});

test("every page loads under the strict CSP, with no violations or errors", async ({ page, baseURL }) => {
  test.setTimeout(PAGES.length * 30_000);   // each page rebuilds the warehouse; CI runners are several times slower than a laptop
  const seen = await watch(page);
  for (const p of PAGES) {
    await page.goto(p);
    await ready(page);
    expect(await cspViolations(page), `CSP violations on ${p}`).toEqual([]);
  }
  const metas = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(metas).toHaveCount(1);
  const scriptSrc = (await metas.getAttribute("content"))!.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"))!;
  expect(scriptSrc).toMatch(/^script-src 'self' 'sha256-/);   // inline scripts pinned by hash...
  expect(scriptSrc).not.toContain("unsafe-inline");            // ...and nothing else inline allowed
  expect(scriptSrc).not.toMatch(/\s'unsafe-eval'/);           // only 'wasm-unsafe-eval', which compiles WASM, not JS
  expect(seen.violations).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});

test("an injected inline script is refused", async ({ page }) => {
  await watch(page);
  await page.goto("/fleet/");
  await ready(page);
  const ran = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__pwned = true";
    document.body.appendChild(s);
    return (window as unknown as { __pwned?: boolean }).__pwned === true;
  });
  expect(ran).toBe(false);
  expect((await cspViolations(page)).length).toBeGreaterThan(0);
});

test("a hostile workbook is shown as text, runs nothing and breaks no SQL", async ({ page, baseURL }) => {
  const seen = await watch(page);
  const sqlId = "X-001'); DROP TABLE vehicles; --";
  const rows = [
    ["Fleet No", "Plate No", `<img src=x onerror="window.__pwned=1">Make`, "Model", "Fuel"],
    [sqlId, "D 1", "<script>window.__pwned=2</script>", "=HYPERLINK(\"https://example.invalid\",\"x\")", "Electric"],
    ["X-002", "D 2", "Tesla", "\"><svg onload=window.__pwned=3>", "Petrol"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Vehicles");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await importWorkbook(page, { name: "hostile.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });

  await page.goto("/fleet/");
  await expect(page.getByText(sqlId).first()).toBeVisible({ timeout: 90_000 });   // stored and shown literally
  await expect(page.getByText("X-002").first()).toBeVisible();                      // the table survived the "DROP"
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator("img[src='x'], svg[onload]").count()).toBe(0);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});

test("an import with a blank required value is blocked, like the Python pipeline", async ({ page }) => {
  const rows = [["Fleet No", "Plate No", "Make", "Model", "Fuel"], ["X-001", "D 1", "Toyota", "Camry", "Petrol"], ["", "D 2", "Tesla", "Model 3", "Electric"]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Vehicles");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await page.goto("/import/");
  await ready(page);
  await page.setInputFiles("input[type=file]", { name: "blank-id.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await page.getByRole("button", { name: /Add to my fleet and build/ }).click();
  await page.waitForURL(/\/fleet\/?$/, { timeout: 90_000 });   // the import page moves on only after the save
  await page.goto("/pipeline/");
  await expect(page.getByText(/required values missing or invalid: vehicles\.vehicle_id: 1 blank/).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("1 row(s) with a blank vehicle_id")).toBeVisible();
});

test("another site framing the app sees a blank page (clickjacking guard)", async ({ page, baseURL }) => {
  // a second origin (another port) stands in for a hostile site embedding the app in an invisible frame
  const hostile = createServer((_q, r) => r.writeHead(200, { "content-type": "text/html" })
    .end(`<iframe src="${baseURL}/fleet/" width="800" height="600"></iframe>`)).listen(4311, "127.0.0.1");
  try {
    await page.goto("http://127.0.0.1:4311/");
    const frame = page.frameLocator("iframe");
    await expect.poll(async () => frame.locator("html").evaluate((el) => getComputedStyle(el).display).catch(() => "pending"),
      { timeout: 30_000 }).toBe("none");
    // the app's own pages are unaffected
    await page.goto("/fleet/");
    expect(await page.locator("html").evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
  } finally { hostile.close(); }
});

test("passphrase protection: nothing readable at rest, wrong passphrase refused, right one opens", async ({ page }) => {
  const PASS = "blue lorry midnight harbour";
  await importWorkbook(page, SAMPLE);

  await page.goto("/plan/");
  await page.getByLabel("New passphrase").fill(PASS);
  await page.getByLabel("Repeat passphrase").fill(PASS);
  await page.getByRole("button", { name: "Protect" }).click();
  await expect(page.getByText(/Protected\. Your fleet data is now encrypted/)).toBeVisible({ timeout: 30_000 });

  // procedure review notes are saved inside the encrypted workspace, never in plain localStorage
  await page.getByRole("link", { name: /Doctrine & SOPs/ }).first().click();   // in-app navigation keeps the tab unlocked
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await page.getByLabel("Evidence and handoff notes").fill("Driver statement ROUTE-7781 for FJ-001");
  await expect(page.getByText(/Saved with this fleet in this browser/)).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("ROUTE-7781");

  // the raw IndexedDB contents hold no plate, VIN or company name
  const raw = await page.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.open("fleetops-workspace");
    req.onsuccess = () => {
      const all = req.result.transaction("kv").objectStore("kv").getAll();
      all.onsuccess = () => resolve(JSON.stringify(all.result, (_k, v) =>
        v instanceof ArrayBuffer ? new TextDecoder("latin1").decode(new Uint8Array(v)) : v));
    };
  }));
  expect(raw).toContain("sealed");
  for (const secret of ["FJ-001", "D 48213", "5YJ3E1EA5PF100001", "Al Fajr", "ROUTE-7781"]) expect(raw).not.toContain(secret);

  await page.reload();
  await expect(page.getByText("Your fleet data is locked.")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Passphrase").fill("blue lorry midnight harbor");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That passphrase is not right.")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });

  await page.goto("/fleet/");
  await expect(page.getByText("Your fleet data is locked.")).toBeVisible({ timeout: 60_000 });   // a reload locks again
  await page.getByLabel("Passphrase").fill(PASS);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("FJ-001").first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("link", { name: /Plan & offline/ }).first().click();
  await page.getByRole("button", { name: "Remove protection" }).click();
  await expect(page.getByText(/Protection removed/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText(/My fleet: \d+ SQL models/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Your fleet data is locked.")).toHaveCount(0);
});

test("the document reader works under the strict CSP and stays on this site", async ({ page, baseURL }) => {
  const seen = await watch(page);
  await importWorkbook(page, SAMPLE);
  await page.goto("/documents/");
  await page.setInputFiles("input[type=file]", path.resolve(__dirname, "../../samples/registration-card-sample.png"));
  await expect(page.getByText(/Matches FJ-002/)).toBeVisible({ timeout: 120_000 });
  expect(await cspViolations(page)).toEqual([]);
  expect(seen.errors).toEqual([]);
  expect([...seen.origins]).toEqual([new URL(baseURL!).origin]);
});


test("the saved demo preview matches the engine and fills widgets before the engine loads", async ({ page, request }) => {
  // Stale preview guard: regenerate with `npm run build && node scripts/demo-preview.mjs && npm run build` after SQL changes.
  const [preview, manifest] = await Promise.all([request.get("/demo-preview.json"), request.get("/engine/manifest.json")]);
  expect(preview.ok()).toBe(true);
  const { createHash } = await import("node:crypto");
  const fingerprint = createHash("sha256").update(await manifest.body()).digest("hex");
  expect((await preview.json()).fingerprint, "demo-preview.json is stale: regenerate it (see scripts/demo-preview.mjs)").toBe(fingerprint);

  await page.route("**/duckdb/**", (route) => route.abort());   // the engine never starts: what shows comes from the preview
  await page.goto("/");
  await expect(page.getByText("Showing saved demo results while the live SQL engine loads…")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Road ready\s*[\d,]{3,}/).first()).toBeVisible({ timeout: 30_000 });
});

test("the deployed build requests the matching SQL revision and keeps it available offline", async ({ page, request }) => {
  const [manifest, precache, worker] = await Promise.all([
    request.get("/engine/manifest.json"), request.get("/precache.json"), request.get("/sw.js"),
  ]);
  const { createHash } = await import("node:crypto");
  const fingerprint = createHash("sha256").update(await manifest.body()).digest("hex");
  const offline = await precache.json();
  const versionedPath = `/engine/manifest.json?revision=${fingerprint}`;
  expect(offline.core).toContain(versionedPath);
  expect((await worker.text()).startsWith(`// FleetOps build ${offline.version}\n`)).toBe(true);
  await page.route((url) => url.pathname === "/engine/manifest.json" && !url.search, (route) => route.abort());
  const revisionLoaded = page.waitForResponse((response) => new URL(response.url()).pathname + new URL(response.url()).search === versionedPath);
  await page.goto("/");
  expect((await revisionLoaded).ok()).toBe(true);
  await expect(page.getByText(/SQL models and \d+ tests ran/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("region", { name: "Daily fleet command" })).toBeVisible();
});
